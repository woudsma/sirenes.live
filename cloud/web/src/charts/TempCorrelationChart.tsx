import { Text } from '@chakra-ui/react'
import { Chart, useChart } from '@chakra-ui/charts'
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import type { CalendarDay } from '../types'
import { ChartCard, ChartEmpty, ChartTooltipCard, axisStyle, CHART_HEIGHT } from './chartShared'
import { useLanguage, dashboardText, sirens } from '../i18n'

// Does a warmer day mean more sirens? One dot per day: x = that day's mean
// temperature (°C, from Open-Meteo), y = sirens detected that day. A rising
// left-to-right cloud means more sirens on warmer days. Days without a fetched
// temperature yet are dropped.
interface Point {
  date: string
  temp: number
  count: number
}

function ScatterTip({ active, payload }: { active?: boolean; payload?: { payload: Point }[] }) {
  const { lang } = useLanguage()
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <ChartTooltipCard>
      <Text fontSize="xs" fontWeight="medium">
        {p.date}
      </Text>
      <Text fontSize="xs" color="fg.muted">
        {p.temp.toFixed(1)}°C · {sirens(p.count, lang)}
      </Text>
    </ChartTooltipCard>
  )
}

export function TempCorrelationChart({ calendar }: { calendar: CalendarDay[] }) {
  const { lang } = useLanguage()
  const c = dashboardText[lang].charts
  const data: Point[] = calendar
    .filter((d) => d.tempC != null)
    .map((d) => ({ date: d.date, temp: d.tempC as number, count: d.count }))

  const chart = useChart({
    data,
    series: [{ name: 'count', color: 'cyan.solid' }],
  })

  return (
    <ChartCard title={c.temp} info={c.tempInfo}>
      {data.length === 0 ? (
        <ChartEmpty>{c.waitingWeather}</ChartEmpty>
      ) : (
        <Chart.Root aspectRatio="auto" chart={chart}>
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <ScatterChart margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
              <CartesianGrid stroke={chart.color('border.muted')} />
              <XAxis
                type="number"
                dataKey="temp"
                name={c.axisTemp}
                unit="°C"
                domain={['dataMin - 1', 'dataMax + 1']}
                {...axisStyle(chart)}
              />
              <YAxis
                type="number"
                dataKey="count"
                name={c.axisSirens}
                allowDecimals={false}
                width={32}
                {...axisStyle(chart)}
              />
              <ZAxis range={[45, 45]} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<ScatterTip />} />
              <Scatter
                data={data}
                fill={chart.color('cyan.solid')}
                fillOpacity={0.6}
                stroke={chart.color('cyan.solid')}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </Chart.Root>
      )}
    </ChartCard>
  )
}
