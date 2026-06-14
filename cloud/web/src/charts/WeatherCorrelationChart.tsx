import { Box, Card, Flex, Text } from '@chakra-ui/react'
import { Chart, useChart } from '@chakra-ui/charts'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { CalendarDay } from '../types'
import { ChartTitle } from './ChartTitle'
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
    <Box bg="bg.panel" borderWidth="1px" borderColor="border" rounded="md" px={3} py={2} shadow="md">
      <Text fontSize="xs" fontWeight="medium">
        {b.label}
      </Text>
      <Text fontSize="xs" color="fg.muted">
        {dashboardText[lang].charts.sirensPerDayUnit(b.avg.toFixed(1), b.days)}
      </Text>
    </Box>
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
    <Card.Root>
      <Card.Body>
        <ChartTitle info={c.weatherInfo}>{c.weather}</ChartTitle>
        {days.length === 0 ? (
          <Flex h="240px" align="center" justify="center">
            <Text fontSize="sm" color="fg.muted">
              {c.waitingWeather}
            </Text>
          </Flex>
        ) : (
          <Chart.Root aspectRatio="auto" chart={chart}>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chart.data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={chart.color('border.muted')} vertical={false} />
                <XAxis
                  dataKey={chart.key('label')}
                  stroke={chart.color('border')}
                  tickLine={false}
                  fontSize={11}
                />
                <YAxis
                  width={32}
                  stroke={chart.color('border')}
                  tickLine={false}
                  fontSize={11}
                />
                <Tooltip cursor={{ fill: 'rgba(127,127,127,0.12)' }} content={<BarTip />} />
                {chart.series.map((s) => (
                  <Bar key={s.name} dataKey={chart.key(s.name)} fill={chart.color(s.color)} radius={4} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </Chart.Root>
        )}
      </Card.Body>
    </Card.Root>
  )
}
