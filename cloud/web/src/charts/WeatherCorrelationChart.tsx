import { Text } from '@chakra-ui/react'
import { Chart, useChart } from '@chakra-ui/charts'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { CalendarDay } from '../types'
import {
  ChartCard,
  ChartEmpty,
  ChartTooltipCard,
  axisStyle,
  gridStyle,
  BAR_CURSOR,
  CHART_HEIGHT,
} from './chartShared'
import { useLanguage, dashboardText } from '../i18n'

// Do sirens track the weather? Precipitation is heavily zero-inflated (most days
// are dry), so a scatter like the temperature chart would pile every dry day at
// x = 0. Instead we bucket each day by how much it rained and compare the AVERAGE
// number of sirens per day in each bucket — a fair comparison even when the
// buckets hold very different numbers of days. Days without fetched precipitation
// are dropped.
const BUCKETS = [
  { key: 'dry' as const, lo: 0, hi: 1 }, // < 1 mm
  { key: 'lightRain' as const, lo: 1, hi: 5 }, // 1–5 mm
  { key: 'rain' as const, lo: 5, hi: Infinity }, // ≥ 5 mm
]

interface Bucket {
  label: string
  avg: number
  days: number
  total: number
}

function BarTip({ active, payload }: { active?: boolean; payload?: { payload: Bucket }[] }) {
  const { lang } = useLanguage()
  if (!active || !payload?.length) return null
  const b = payload[0].payload
  return (
    <ChartTooltipCard>
      <Text fontSize="xs" fontWeight="medium">
        {b.label}
      </Text>
      <Text fontSize="xs" color="fg.muted">
        {dashboardText[lang].charts.sirensPerDayUnit(b.avg.toFixed(1), b.days)}
      </Text>
    </ChartTooltipCard>
  )
}

export function WeatherCorrelationChart({ calendar }: { calendar: CalendarDay[] }) {
  const { lang } = useLanguage()
  const c = dashboardText[lang].charts
  const days = calendar.filter((d) => d.precipMm != null)
  const data: Bucket[] = BUCKETS.map((b) => {
    const inBucket = days.filter((d) => {
      const p = d.precipMm as number
      return p >= b.lo && p < b.hi
    })
    const total = inBucket.reduce((sum, d) => sum + d.count, 0)
    return {
      label: c.buckets[b.key],
      days: inBucket.length,
      total,
      avg: inBucket.length ? total / inBucket.length : 0,
    }
  })

  const chart = useChart({
    data,
    series: [{ name: 'avg', color: 'blue.solid', label: c.series.sirensPerDay }],
  })

  return (
    <ChartCard title={c.weather} info={c.weatherInfo}>
      {days.length === 0 ? (
        <ChartEmpty>{c.waitingWeather}</ChartEmpty>
      ) : (
        <Chart.Root aspectRatio="auto" chart={chart}>
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart data={chart.data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid {...gridStyle(chart)} />
              <XAxis dataKey={chart.key('label')} {...axisStyle(chart)} />
              <YAxis width={32} {...axisStyle(chart)} />
              <Tooltip cursor={BAR_CURSOR} content={<BarTip />} />
              {chart.series.map((s) => (
                <Bar
                  key={s.name}
                  dataKey={chart.key(s.name)}
                  fill={chart.color(s.color)}
                  radius={4}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </Chart.Root>
      )}
    </ChartCard>
  )
}
