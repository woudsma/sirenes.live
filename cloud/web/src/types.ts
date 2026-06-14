// Shapes mirror the cloud server JSON API, which mirrors the firmware's
// (see cloud/server/src/db.js and firmware/src/events.cpp) so the charts and
// event table are shared verbatim with the on-device UI.

export interface PerDay {
  date: string // YYYY-MM-DD
  count: number
  peakDb: number
}

export interface DbBin {
  bin: string
  count: number
}

export interface Stats {
  today: number
  total: number
  perDay: PerDay[]
  perHour: number[] // length 24
  dbHistogram: DbBin[]
}

export interface SirenEvent {
  ts: number // unix seconds
  durationS: number
  peakDb: number
  confidence: number
  clip?: string // URL to the recorded WAV clip, if one was saved
  reviewed: boolean // admin has manually listened to the clip
}

export interface EventsResponse {
  total: number
  unreviewed: number // events not yet manually reviewed (all events, not just this page)
  events: SirenEvent[]
}

// --- cloud-only report analytics (GET /api/insights) -----------------------

export interface Kpis {
  total: number
  totalSeconds: number
  avgPerDay: number
  daysActive: number
  busiestDay: { date: string | null; count: number }
  busiestHour: { date: string | null; hour: number; count: number }
  loudestDb: number
  avgDb: number
  avgDurationS: number
  longestEventS: number
  longestQuietStreakS: number // longest daytime-only gap between two sirens
  quietStreak: { from: string | null; to: string | null } // local dates bounding that gap
}

export interface CalendarDay {
  date: string // YYYY-MM-DD
  count: number
  peakDb: number
  totalSeconds: number
  tempC?: number | null // daily mean temperature (°C), null until weather is fetched
}

export interface WeekHourCell {
  weekday: number // 0=Sun … 6=Sat
  hour: number // 0–23
  count: number
}

export interface WeekHourWeekCell extends WeekHourCell {
  weekStart: string // YYYY-MM-DD, the Monday that opens this week
}

export interface Insights {
  kpis: Kpis
  calendar: CalendarDay[] // oldest → newest
  weekdayHour: WeekHourCell[] // all-time aggregate
  weekdayHourByWeek: WeekHourWeekCell[] // same, but split per Monday-start week
}
