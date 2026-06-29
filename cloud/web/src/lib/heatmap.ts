// Shared colour scale for the calendar + weekday×hour heatmaps. Empty days use a
// muted neutral; non-empty days step through the brand red ramp. A sqrt scale
// keeps low counts visible instead of washing them out against busy days.

export const HEAT_EMPTY = 'bg.muted'
// Darker neutral for cells with no data collected (admin-recorded downtime), so
// they read as "no data" rather than "zero sirens" against the empty colour.
export const HEAT_DOWNTIME = 'gray.400'
export const HEAT_LEVELS = [
  'brand.100',
  'brand.200',
  'brand.300',
  'brand.400',
  'brand.500',
  'brand.700',
]

export function heatColor(count: number, max: number): string {
  if (count <= 0 || max <= 0) return HEAT_EMPTY
  const ratio = Math.sqrt(count / max)
  const idx = Math.min(
    HEAT_LEVELS.length - 1,
    Math.max(0, Math.ceil(ratio * HEAT_LEVELS.length) - 1)
  )
  return HEAT_LEVELS[idx]
}
