// Local-date helpers shared by the calendar/heatmap charts and KPI tiles. All
// work in the browser's local zone and avoid the UTC shift of toISOString().

// Local YYYY-MM-DD for a Date.
export function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Local YYYY-MM-DD for today.
export function todayIso(): string {
  return isoDate(new Date())
}

// Parse a YYYY-MM-DD string into a Date at local midnight.
export function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// A new Date `n` days after `d` (negative `n` goes back).
export function addDays(d: Date, n: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}
