const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const MONTHS_NL = [
  'januari',
  'februari',
  'maart',
  'april',
  'mei',
  'juni',
  'juli',
  'augustus',
  'september',
  'oktober',
  'november',
  'december',
]

type Lang = 'en' | 'nl'

// "6th" — a day-of-month with its ordinal suffix (1st/2nd/3rd/4th…).
function ordinalDay(d: number): string {
  const tens = d % 100
  const suffix =
    tens >= 11 && tens <= 13
      ? 'th'
      : d % 10 === 1
        ? 'st'
        : d % 10 === 2
          ? 'nd'
          : d % 10 === 3
            ? 'rd'
            : 'th'
  return `${d}${suffix}`
}

// "6th of June" (en) / "6 juni" (nl) from a YYYY-MM-DD string.
export function formatDateLong(iso: string, lang: Lang = 'en'): string {
  const [, m, d] = iso.split('-').map(Number)
  if (lang === 'nl') return `${d} ${MONTHS_NL[m - 1]}`
  return `${ordinalDay(d)} of ${MONTHS[m - 1]}`
}

// A compact date range from two YYYY-MM-DD strings: "3rd of June" for a single
// day, "3rd – 5th of June" within one month, else "30th of May – 2nd of June".
export function formatDateRange(startIso: string, endIso: string, lang: Lang = 'en'): string {
  if (startIso === endIso) return formatDateLong(startIso, lang)
  const [sy, sm, sd] = startIso.split('-').map(Number)
  const [ey, em, ed] = endIso.split('-').map(Number)
  if (sy === ey && sm === em) {
    if (lang === 'nl') return `${sd} – ${ed} ${MONTHS_NL[sm - 1]}`
    return `${ordinalDay(sd)} – ${ordinalDay(ed)} of ${MONTHS[sm - 1]}`
  }
  return `${formatDateLong(startIso, lang)} – ${formatDateLong(endIso, lang)}`
}

// Human-friendly duration: "45s", "12m", "3h 12m".
export function formatDuration(seconds: number): string {
  const s = Math.round(seconds)
  if (s < 60) return `${s}s`
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`
  return `${m}m`
}
