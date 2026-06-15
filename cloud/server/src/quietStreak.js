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

// `epochs` must be ascending. A multi-day quiet spell accumulates 16h per day and
// skips the nights between. Returns the streak length in seconds plus the local
// dates of the sirens that bound it (null when there's no gap).
export function longestQuietDaytimeStreak(epochs) {
  let longest = 0
  let from = null
  let to = null
  for (let i = 1; i < epochs.length; i++) {
    const gap = daytimeSecondsBetween(epochs[i - 1], epochs[i])
    if (gap > longest) {
      longest = gap
      from = localDate(epochs[i - 1])
      to = localDate(epochs[i])
    }
  }
  return { seconds: longest, from, to }
}
