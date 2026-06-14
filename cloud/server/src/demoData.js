// Synthetic demo dataset for the dev-only seed toggle (see /api/dev/seed in
// index.js). Generates events spread over the last `days` days *relative to now*
// so the calendar/heatmap tiles always look populated. The shape mirrors a real
// detection stream: busier in daylight with morning/evening rush-hour bumps,
// quieter on weekends, loudness spread across the histogram range. A seeded PRNG
// makes the output repeatable. Never used in production — dev/demo only.

// Deterministic PRNG (mulberry32) so the demo data is the same every run.
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Relative hourly likelihood of a siren (index = local hour 0–23). Low overnight,
// rising through the day with bumps at the morning (08:00) and evening (17–18)
// commutes.
const HOUR_PROFILE = [
  2, 1, 1, 1, 1, 2, 4, 7, 10, 8, 7, 7, 7, 7, 7, 8, 9, 10, 9, 7, 6, 5, 4, 3,
]

// Pick an hour weighted by HOUR_PROFILE (commute peaks flattened on weekends).
function pickHour(rng, weekend) {
  const weights = HOUR_PROFILE.map((w, h) =>
    weekend && (h === 8 || h === 17 || h === 18) ? w * 0.5 : w
  )
  const total = weights.reduce((s, w) => s + w, 0)
  let r = rng() * total
  for (let h = 0; h < 24; h++) {
    r -= weights[h]
    if (r <= 0) return h
  }
  return 12
}

// Local midnight for "today minus d days".
function localMidnight(daysAgo) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - daysAgo)
  return Math.floor(d.getTime() / 1000)
}

export function generateDemoEvents({ days = 90, seed = 1337 } = {}) {
  const rng = mulberry32(seed)
  const used = new Set()
  const events = []

  for (let d = days - 1; d >= 0; d--) {
    const midnight = localMidnight(d)
    const weekday = new Date(midnight * 1000).getDay() // 0=Sun … 6=Sat
    const weekend = weekday === 0 || weekday === 6

    // Count for the day: ~12/weekday, ~7/weekend, with noise. The most recent
    // day is partial, so taper it toward "now".
    const base = weekend ? 7 : 12
    let count = Math.max(0, Math.round(base + (rng() - 0.5) * 8))
    if (d === 0) {
      const fracOfDay = (Date.now() / 1000 - midnight) / 86400
      count = Math.round(count * Math.min(1, Math.max(0, fracOfDay)))
    }

    for (let i = 0; i < count; i++) {
      const hour = pickHour(rng, weekend)
      const min = Math.floor(rng() * 60)
      const sec = Math.floor(rng() * 60)
      let epoch = midnight + hour * 3600 + min * 60 + sec
      while (used.has(epoch)) epoch++ // keep epochs unique (PK)
      used.add(epoch)

      // Loudness spread across the dB histogram, with rare very-loud events.
      let peakDb = 50 + rng() * 35 // ~50–85
      if (rng() < 0.06) peakDb += 15 + rng() * 10 // occasional >100
      peakDb = Math.round(peakDb * 10) / 10

      events.push({
        epoch,
        durationS: Math.round(8 + rng() * 52), // 8–60 s
        peakDb,
        confidence: Math.round((0.95 + rng() * 0.049) * 1000) / 1000,
        hasClip: 0,
      })
    }
  }
  return events
}
