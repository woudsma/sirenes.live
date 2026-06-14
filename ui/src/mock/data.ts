// Mock dataset used when the UI is not connected to a device (e.g. `npm run dev`)
// so charts and tables are designable offline. Replaced by real data once the
// device responds to /api/stats and /api/events.

import type { Stats, EventsResponse, SirenEvent, DeviceConfig } from '../types'
import { demoSirenClip } from './sirenClip'

function isoDate(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString().slice(0, 10)
}

// Hourly weighting — busier in daytime, a small overnight tail.
const HOUR_WEIGHTS = [
  2, 1, 1, 1, 2, 4, 7, 10, 12, 11, 10, 9, 9, 10, 11, 12, 13, 12, 10, 8, 6, 5, 4, 3,
]

const perDay = Array.from({ length: 14 }, (_, i) => {
  const daysAgo = 13 - i
  const count = 8 + Math.round(Math.random() * 18)
  const peakDb = 84 + Math.round(Math.random() * 140) / 10
  return { date: isoDate(daysAgo), count, peakDb }
})

const today = perDay[perDay.length - 1].count
const total = perDay.reduce((s, d) => s + d.count, 0) + 372

const perHour = HOUR_WEIGHTS.map((w) => Math.round(w * 3.2 + Math.random() * 4))

const dbHistogram = [
  { bin: '<70', count: 14 },
  { bin: '70-80', count: 63 },
  { bin: '80-90', count: 158 },
  { bin: '90-100', count: 91 },
  { bin: '>=100', count: 19 },
]

export const MOCK_STATS: Stats = { today, total, perDay, perHour, dbHistogram }

function makeEvents(n: number): SirenEvent[] {
  const out: SirenEvent[] = []
  let t = Math.floor(Date.now() / 1000)
  for (let i = 0; i < n; i++) {
    t -= 1200 + Math.floor(Math.random() * 9000) // ~20min–2.5h apart
    out.push({
      ts: t,
      durationS: 4 + Math.floor(Math.random() * 18),
      peakDb: 78 + Math.round(Math.random() * 220) / 10,
      confidence: 0.85 + Math.round(Math.random() * 140) / 1000,
      // Most recent detections still have audio (older ones rotated out).
      clip: i < 18 ? demoSirenClip() : undefined,
    })
  }
  return out
}

export const MOCK_EVENTS: EventsResponse = { total, events: makeEvents(50) }

export const MOCK_CONFIG: DeviceConfig = {
  cal_offset_db: -2,
  score_on: 0.8,
  score_off: 0.5,
  min_ms: 3000,
}
