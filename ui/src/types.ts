// Shapes mirror the firmware JSON API (see SPECIFICATIONS.md §2).

export interface Status {
  type: 'status'
  db: number
  score: number
  detecting: boolean
  paused?: boolean // detection toggled off from the UI (optional: older fw omits it)
  // Live "cat" class indicator (display-only — never counted as an event).
  catScore?: number
  cat?: boolean
  today: number
  total: number
  uptimeS: number
  timeValid: boolean
  host: string
  // System info (bytes). Optional: older firmware / mock may omit them.
  freeHeap?: number
  heapSize?: number
  fsUsed?: number
  fsTotal?: number
}

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
  clip?: string // URL to the recorded MP3 clip, if one was saved
}

export interface EventsResponse {
  total: number
  events: SirenEvent[]
}

export interface DeviceConfig {
  cal_offset_db: number
  score_on: number
  score_off: number
  min_ms: number
}
