// Longest quiet-daytime streak between consecutive detections. Pure date math,
// kept out of the DB layer (db.js calls this from insights()).
//
// Only 07:00–23:00 local counts toward a streak; night hours are skipped (they
// neither extend nor break it). DAY_START/DAY_END mirror the web KpiTiles. All
// local-time math relies on the process TZ being the deployment's local zone —
// the same assumption as db.js's SQL 'localtime' bucketing.

const DAY_START_HOUR = 7
const DAY_END_HOUR = 23

// Daytime seconds within [t1, t2) (unix seconds, t1 < t2), summing each day's
// overlap with that day's local 07:00–23:00 window. Local-time Date construction
// lets the engine handle DST transitions.
function daytimeSecondsBetween(t1, t2) {
  let total = 0
  const d = new Date(t1 * 1000)
  let day = new Date(d.getFullYear(), d.getMonth(), d.getDate()) // local midnight
  while (day.getTime() / 1000 < t2) {
    const y = day.getFullYear()
    const m = day.getMonth()
    const dd = day.getDate()
    const dayStart = new Date(y, m, dd, DAY_START_HOUR).getTime() / 1000
    const dayEnd = new Date(y, m, dd, DAY_END_HOUR).getTime() / 1000
    const lo = Math.max(t1, dayStart)
    const hi = Math.min(t2, dayEnd)
    if (hi > lo) total += hi - lo
    day = new Date(y, m, dd + 1)
  }
  return total
}

// Local YYYY-MM-DD for a unix epoch.
function localDate(epoch) {
  const d = new Date(epoch * 1000)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Every local YYYY-MM-DD date that any downtime interval touches. A period that
// straddles midnight marks both days. Used by db.js to drop incomplete days from
// the per-day / per-night averages. `downtime` is [{ startEpoch, endEpoch }].
export function downtimeLocalDates(downtime) {
  const dates = new Set()
  for (const { startEpoch, endEpoch } of downtime) {
    const s = new Date(startEpoch * 1000)
    let day = new Date(s.getFullYear(), s.getMonth(), s.getDate()) // local midnight
    while (day.getTime() / 1000 < endEpoch) {
      dates.add(localDate(Math.floor(day.getTime() / 1000)))
      day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)
    }
  }
  return [...dates]
}

// `epochs` must be ascending. A multi-day quiet spell accumulates 16h per day and
// skips the nights between. `downtime` ([{ startEpoch, endEpoch }]) are periods
// with no data: a quiet streak may neither span one nor count its time as quiet, so
// each inter-event gap is split at downtime boundaries and only its downtime-free
// sub-intervals are measured. Returns the streak length in seconds plus the local
// dates bounding it (null when there's no gap).
export function longestQuietDaytimeStreak(epochs, downtime = []) {
  // Downtime sorted by start, for splitting gaps below.
  const downs = [...downtime].sort((a, b) => a.startEpoch - b.startEpoch)
  let longest = 0
  let from = null
  let to = null
  const consider = (lo, hi) => {
    if (hi <= lo) return
    const secs = daytimeSecondsBetween(lo, hi)
    if (secs > longest) {
      longest = secs
      from = localDate(lo)
      to = localDate(hi)
    }
  }
  for (let i = 1; i < epochs.length; i++) {
    // Walk [a, b), carving out any overlapping downtime so a streak can't bridge
    // or include it; each surviving sub-interval is a quiet candidate.
    let cursor = epochs[i - 1]
    const b = epochs[i]
    for (const d of downs) {
      if (d.endEpoch <= cursor || d.startEpoch >= b) continue // no overlap with [cursor, b)
      consider(cursor, Math.min(d.startEpoch, b))
      cursor = Math.max(cursor, d.endEpoch)
      if (cursor >= b) break
    }
    consider(cursor, b)
  }
  return { seconds: longest, from, to }
}
