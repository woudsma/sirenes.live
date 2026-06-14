// Daily weather for Amsterdam, from Open-Meteo (free, no API key): mean
// temperature (°C) and total precipitation (mm).
//
// We only need one value per calendar day (the weather/siren correlations are
// daily), so weather lives in its own `daily_weather` table keyed by local date —
// not copied onto every event row. This module fills that table: for the dates
// that have sirens but no cached weather (plus the last few days, whose values are
// still provisional), it fetches the daily mean temp + precip total and upserts.
//
// Two endpoints are combined because each covers a different window:
//   - archive  (ERA5 reanalysis) — accurate, but lags ~5 days behind today.
//   - forecast (past_days)       — covers the most recent days incl. today.
// We overlay the forecast onto the archive so recent days aren't left blank.

// OLVG West, Amsterdam (matches the listening spot in the UI header).
const LAT = 52.37
const LON = 4.89
const TZ = 'Europe/Amsterdam'

const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive'
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
const FORECAST_PAST_DAYS = 92 // Open-Meteo's max look-back for the forecast API

// Fetch daily weather from one Open-Meteo endpoint →
// Map<'YYYY-MM-DD', { temp: °C|null, precip: mm|null }>.
async function fetchDaily(base, params) {
  const u = new URL(base)
  u.searchParams.set('latitude', LAT)
  u.searchParams.set('longitude', LON)
  u.searchParams.set('daily', 'temperature_2m_mean,precipitation_sum')
  u.searchParams.set('timezone', TZ)
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)

  const res = await fetch(u)
  if (!res.ok) throw new Error(`open-meteo ${res.status}`)
  const json = await res.json()
  const times = json?.daily?.time ?? []
  const temps = json?.daily?.temperature_2m_mean ?? []
  const precs = json?.daily?.precipitation_sum ?? []
  const out = new Map()
  times.forEach((date, i) => {
    out.set(date, { temp: temps[i] ?? null, precip: precs[i] ?? null })
  })
  return out
}

// Bring `daily_weather` up to date for every day that has sirens. Best-effort:
// network/API failures are logged and swallowed so they never break ingest or
// the API. Safe to call repeatedly — it only fetches what's missing or stale.
export async function refreshWeather(store) {
  const want = store.eventDates() // distinct local dates that have ≥1 siren, asc
  if (want.length === 0) return

  const cached = new Set(store.cachedWeatherDates())
  // Always re-fetch the last few days: their values were provisional forecasts.
  const recentCutoff = isoDaysAgo(4)
  const need = want.filter((d) => !cached.has(d) || d >= recentCutoff)
  if (need.length === 0) return

  const start = need[0]
  const end = need[need.length - 1]
  try {
    const [archive, forecast] = await Promise.all([
      fetchDaily(ARCHIVE_URL, { start_date: start, end_date: end }).catch(() => new Map()),
      fetchDaily(FORECAST_URL, { past_days: FORECAST_PAST_DAYS }).catch(() => new Map()),
    ])
    // Forecast overlays the archive so the recent (archive-lagged) days win.
    const merged = new Map([...archive, ...forecast])
    let filled = 0
    for (const date of need) {
      const w = merged.get(date)
      if (w && (w.temp != null || w.precip != null)) {
        store.upsertWeather(date, w.temp, w.precip)
        filled++
      }
    }
    console.log(`weather: filled ${filled}/${need.length} day(s) (${start} → ${end})`)
  } catch (err) {
    console.warn(`weather: refresh failed — ${err.message}`)
  }
}

function isoDaysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  const p = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
