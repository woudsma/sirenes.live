// Helpers for shading downtime ("no data collected") onto the heatmaps. Kept here
// so the weekday×hour punchcard and the year calendar agree on what counts as
// downtime. Epoch math is in browser-local time, matching the server's localtime
// bucketing (the deployment TZ is Amsterdam).

import type { Downtime } from '../types'
import { parseIso, addDays } from './date'

const DAY_S = 86400

// The first downtime period overlapping [startEpoch, endEpoch), or undefined. Used
// for one-hour heatmap cells.
export function downtimeAt(
  downtime: Downtime[],
  startEpoch: number,
  endEpoch: number
): Downtime | undefined {
  return downtime.find((d) => d.startEpoch < endEpoch && d.endEpoch > startEpoch)
}

// A downtime period that fully covers the whole calendar day `iso` (YYYY-MM-DD) AND
// spans more than one full day — so the year calendar only greys multi-day outages,
// not short same-day ones (those show on the weekday×hour heatmap instead).
export function multiDayDowntimeOn(downtime: Downtime[], iso: string): Downtime | undefined {
  const dayStart = Math.floor(parseIso(iso).getTime() / 1000)
  const dayEnd = Math.floor(addDays(parseIso(iso), 1).getTime() / 1000)
  return downtime.find(
    (d) => d.startEpoch <= dayStart && d.endEpoch >= dayEnd && d.endEpoch - d.startEpoch > DAY_S
  )
}
