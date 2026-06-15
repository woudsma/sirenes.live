import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { longestQuietDaytimeStreak } from './quietStreak.js'

// SQLite-backed event store. One row per detection, keyed by its start `epoch`
// (unix seconds) — the same key the ESP32 names its WAV file after, so audio and
// metadata link without a separate id. Stats are aggregated in SQL to match the
// JSON shapes the firmware serves (firmware/src/events.cpp), so the shared chart
// components render unchanged.
//
// All day/hour bucketing uses 'localtime' — set the container TZ (e.g.
// Europe/Amsterdam) so "today" and the time-of-day chart match the device.

const DB_BINS = [
  { bin: '<70', lo: -Infinity, hi: 70 },
  { bin: '70-80', lo: 70, hi: 80 },
  { bin: '80-90', lo: 80, hi: 90 },
  { bin: '90-100', lo: 90, hi: 100 },
  { bin: '>=100', lo: 100, hi: Infinity },
]

export function createStore(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      epoch      INTEGER PRIMARY KEY,
      duration_s INTEGER NOT NULL DEFAULT 0,
      peak_db    REAL    NOT NULL DEFAULT 0,
      confidence REAL    NOT NULL DEFAULT 0,
      has_clip   INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
  `)

  // One row of daily weather per local calendar date — mean temperature (°C) and
  // total precipitation (mm) — fetched from Open-Meteo (see weather.js) and joined
  // into the calendar for the weather/siren correlation charts. Kept in its own
  // table so it's one row per day, not copied onto every event.
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_weather (
      date       TEXT    PRIMARY KEY,  -- YYYY-MM-DD, local
      temp_c     REAL,
      precip_mm  REAL,
      fetched_at INTEGER NOT NULL
    );
  `)

  // `precip_mm` (daily total precipitation) was added after temperature — backfill
  // the column on pre-existing DBs. refreshWeather then re-fetches the historical
  // dates from Open-Meteo to fill it in, so no manual DB migration is needed.
  if (
    !db
      .prepare('PRAGMA table_info(daily_weather)')
      .all()
      .some((c) => c.name === 'precip_mm')
  ) {
    db.exec('ALTER TABLE daily_weather ADD COLUMN precip_mm REAL')
  }

  // `reviewed` (admin manually listened to the clip) was added later — backfill
  // the column on pre-existing DBs. No-op once it's there.
  if (
    !db
      .prepare('PRAGMA table_info(events)')
      .all()
      .some((c) => c.name === 'reviewed')
  ) {
    db.exec('ALTER TABLE events ADD COLUMN reviewed INTEGER NOT NULL DEFAULT 0')
  }

  const stmts = {
    upsert: db.prepare(`
      INSERT INTO events (epoch, duration_s, peak_db, confidence, has_clip, created_at)
      VALUES (@epoch, @durationS, @peakDb, @confidence, @hasClip, @createdAt)
      ON CONFLICT(epoch) DO UPDATE SET
        duration_s = excluded.duration_s,
        peak_db    = excluded.peak_db,
        confidence = excluded.confidence,
        has_clip   = MAX(events.has_clip, excluded.has_clip)
    `),
    markClip: db.prepare('UPDATE events SET has_clip = 1 WHERE epoch = ?'),
    markReviewed: db.prepare('UPDATE events SET reviewed = 1 WHERE epoch = ?'),
    get: db.prepare('SELECT * FROM events WHERE epoch = ?'),
    del: db.prepare('DELETE FROM events WHERE epoch = ?'),
    clear: db.prepare('DELETE FROM events'),
    count: db.prepare('SELECT COUNT(*) AS c FROM events'),
    unreviewed: db.prepare('SELECT COUNT(*) AS c FROM events WHERE reviewed = 0'),
    today: db.prepare(`
      SELECT COUNT(*) AS c FROM events
      WHERE date(epoch, 'unixepoch', 'localtime') = date('now', 'localtime')
    `),
    page: db.prepare(`
      SELECT epoch, duration_s, peak_db, confidence, has_clip, reviewed
      FROM events ORDER BY epoch DESC LIMIT ? OFFSET ?
    `),
    all: db.prepare(`
      SELECT epoch, duration_s, peak_db, confidence, has_clip, reviewed
      FROM events ORDER BY epoch DESC
    `),
    // Ascending timestamps for the quiet-streak scan.
    epochsAsc: db.prepare('SELECT epoch FROM events ORDER BY epoch ASC'),
    perDay: db.prepare(`
      SELECT date(epoch, 'unixepoch', 'localtime') AS date,
             COUNT(*) AS count, MAX(peak_db) AS peakDb
      FROM events GROUP BY date ORDER BY date DESC LIMIT 30
    `),
    perHour: db.prepare(`
      SELECT CAST(strftime('%H', epoch, 'unixepoch', 'localtime') AS INTEGER) AS hour,
             COUNT(*) AS count
      FROM events GROUP BY hour
    `),
    hist: db.prepare(`
      SELECT
        SUM(peak_db < 70)                       AS b0,
        SUM(peak_db >= 70  AND peak_db < 80)    AS b1,
        SUM(peak_db >= 80  AND peak_db < 90)    AS b2,
        SUM(peak_db >= 90  AND peak_db < 100)   AS b3,
        SUM(peak_db >= 100)                     AS b4
      FROM events
    `),

    // --- cloud-only richer analytics (see insights()) ----------------------
    // Per-day over a long window (no 30-day cap), oldest → newest, with the
    // total siren-time per day so the cumulative + duration charts can derive
    // from one query.
    calendar: db.prepare(`
      SELECT date(e.epoch, 'unixepoch', 'localtime') AS date,
             COUNT(*) AS count, MAX(e.peak_db) AS peakDb, SUM(e.duration_s) AS totalSeconds,
             w.temp_c AS tempC, w.precip_mm AS precipMm
      FROM events e
      LEFT JOIN daily_weather w ON w.date = date(e.epoch, 'unixepoch', 'localtime')
      WHERE e.epoch >= strftime('%s', 'now', '-370 days')
      GROUP BY date ORDER BY date ASC
    `),
    // Distinct local dates that have at least one siren (for the weather backfill).
    eventDates: db.prepare(`
      SELECT DISTINCT date(epoch, 'unixepoch', 'localtime') AS date
      FROM events
      WHERE epoch >= strftime('%s', 'now', '-370 days')
      ORDER BY date ASC
    `),
    // Only dates with BOTH values cached count as done; a row that has temp but
    // no precip (pre-existing, from before precip was tracked) is re-fetched so
    // the precipitation backfill happens automatically.
    cachedWeatherDates: db.prepare(
      'SELECT date FROM daily_weather WHERE temp_c IS NOT NULL AND precip_mm IS NOT NULL'
    ),
    upsertWeather: db.prepare(`
      INSERT INTO daily_weather (date, temp_c, precip_mm, fetched_at)
      VALUES (@date, @tempC, @precipMm, @fetchedAt)
      ON CONFLICT(date) DO UPDATE SET
        temp_c     = excluded.temp_c,
        precip_mm  = excluded.precip_mm,
        fetched_at = excluded.fetched_at
    `),
    weekdayHour: db.prepare(`
      SELECT CAST(strftime('%w', epoch, 'unixepoch', 'localtime') AS INTEGER) AS weekday,
             CAST(strftime('%H', epoch, 'unixepoch', 'localtime') AS INTEGER) AS hour,
             COUNT(*) AS count
      FROM events GROUP BY weekday, hour
    `),
    // Same punchcard but bucketed by the Monday-start week it belongs to, so the
    // dashboard can show one week at a time. `weekStart` is the local Monday date.
    weekdayHourByWeek: db.prepare(`
      SELECT date(epoch, 'unixepoch', 'localtime', '-6 days', 'weekday 1') AS weekStart,
             CAST(strftime('%w', epoch, 'unixepoch', 'localtime') AS INTEGER) AS weekday,
             CAST(strftime('%H', epoch, 'unixepoch', 'localtime') AS INTEGER) AS hour,
             COUNT(*) AS count
      FROM events
      WHERE epoch >= strftime('%s', 'now', '-370 days')
      GROUP BY weekStart, weekday, hour
      ORDER BY weekStart ASC
    `),
    // The single calendar-day hour with the most sirens (one specific date + hour),
    // not the all-time busiest hour-of-day.
    busiestHour: db.prepare(`
      SELECT date(epoch, 'unixepoch', 'localtime') AS date,
             CAST(strftime('%H', epoch, 'unixepoch', 'localtime') AS INTEGER) AS hour,
             COUNT(*) AS count
      FROM events
      GROUP BY date, hour
      ORDER BY count DESC, date DESC, hour ASC LIMIT 1
    `),
    kpiAgg: db.prepare(`
      SELECT
        COUNT(*)                                            AS total,
        COALESCE(SUM(duration_s), 0)                        AS totalSeconds,
        COALESCE(AVG(duration_s), 0)                        AS avgDurationS,
        COALESCE(MAX(duration_s), 0)                        AS longestEventS,
        COALESCE(MAX(peak_db), 0)                           AS loudestDb,
        COALESCE(AVG(peak_db), 0)                           AS avgDb,
        COUNT(DISTINCT date(epoch, 'unixepoch', 'localtime')) AS daysActive
      FROM events
    `),
  }

  const toEvent = (r) => ({
    ts: r.epoch,
    durationS: r.duration_s,
    peakDb: r.peak_db,
    confidence: r.confidence,
    clip: r.has_clip ? `/api/clip/${r.epoch}.wav` : undefined,
    reviewed: !!r.reviewed,
  })

  return {
    upsertEvent({ epoch, durationS = 0, peakDb = 0, confidence = 0, hasClip = 0 }) {
      stmts.upsert.run({
        epoch,
        durationS: Math.round(durationS),
        peakDb,
        confidence,
        hasClip: hasClip ? 1 : 0,
        createdAt: Math.floor(Date.now() / 1000),
      })
    },
    markClip(epoch) {
      stmts.markClip.run(epoch)
    },
    markReviewed(epoch) {
      return stmts.markReviewed.run(epoch).changes > 0
    },
    getEvent(epoch) {
      return stmts.get.get(epoch)
    },
    deleteEvent(epoch) {
      return stmts.del.run(epoch).changes > 0
    },
    clear() {
      stmts.clear.run()
    },
    // --- weather (see weather.js) ------------------------------------------
    eventDates() {
      return stmts.eventDates.all().map((r) => r.date)
    },
    cachedWeatherDates() {
      return stmts.cachedWeatherDates.all().map((r) => r.date)
    },
    upsertWeather(date, tempC, precipMm) {
      stmts.upsertWeather.run({
        date,
        tempC: tempC ?? null,
        precipMm: precipMm ?? null,
        fetchedAt: Math.floor(Date.now() / 1000),
      })
    },
    count() {
      return stmts.count.get().c
    },
    listEvents(limit, offset) {
      return {
        total: stmts.count.get().c,
        unreviewed: stmts.unreviewed.get().c,
        events: stmts.page.all(limit, offset).map(toEvent),
      }
    },
    // Every event (newest first), same shape as listEvents — for the web event
    // log, which renders the whole history in a virtualized table.
    listAllEvents() {
      return {
        total: stmts.count.get().c,
        unreviewed: stmts.unreviewed.get().c,
        events: stmts.all.all().map(toEvent),
      }
    },
    allEvents() {
      return stmts.all.all().map(toEvent)
    },
    stats() {
      const perHour = Array(24).fill(0)
      for (const r of stmts.perHour.all()) perHour[r.hour] = r.count
      const h = stmts.hist.get()
      const dbHistogram = DB_BINS.map((b, i) => ({ bin: b.bin, count: h[`b${i}`] || 0 }))
      const perDay = stmts.perDay.all().reverse() // oldest → newest for the chart
      return {
        today: stmts.today.get().c,
        total: stmts.count.get().c,
        perDay,
        perHour,
        dbHistogram,
      }
    },
    // Cloud-only analytics powering the report dashboard. Kept separate from
    // stats() so /api/stats stays byte-for-byte compatible with the firmware.
    insights() {
      const calendar = stmts.calendar.all() // oldest → newest
      const weekdayHour = stmts.weekdayHour.all()
      const weekdayHourByWeek = stmts.weekdayHourByWeek.all()
      const agg = stmts.kpiAgg.get()
      const busiestHour = stmts.busiestHour.get() || { date: null, hour: 0, count: 0 }
      const busiestDay = calendar.reduce(
        (best, d) => (d.count > best.count ? { date: d.date, count: d.count } : best),
        { date: null, count: 0 }
      )
      const quietStreak = longestQuietDaytimeStreak(stmts.epochsAsc.all().map((r) => r.epoch))
      return {
        kpis: {
          total: agg.total,
          totalSeconds: agg.totalSeconds,
          avgPerDay: agg.daysActive ? agg.total / agg.daysActive : 0,
          daysActive: agg.daysActive,
          busiestDay,
          busiestHour,
          loudestDb: agg.loudestDb,
          avgDb: agg.avgDb,
          avgDurationS: agg.avgDurationS,
          longestEventS: agg.longestEventS,
          longestQuietStreakS: quietStreak.seconds,
          quietStreak: { from: quietStreak.from, to: quietStreak.to },
        },
        calendar,
        weekdayHour,
        weekdayHourByWeek,
      }
    },
  }
}
