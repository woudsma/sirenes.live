import { Chart, useChart } from '@chakra-ui/charts'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { CalendarDay } from '../types'
import { ChartCard, axisStyle, gridStyle, BAR_CURSOR, CHART_HEIGHT } from './chartShared'
import { useLanguage, dashboardText } from '../i18n'

// Total siren-time per day (minutes) over the last 30 days — pairs loudness with
// "how long were we exposed". Derived from the calendar's totalSeconds.
export function DurationChart({ calendar }: { calendar: CalendarDay[] }) {
  const { lang } = useLanguage()
  const c = dashboardText[lang].charts
  const data = calendar.slice(-30).map((d) => ({
    date: d.date,
    minutes: Math.round(d.totalSeconds / 60),
  }))

  const chart = useChart({
    data,
    series: [{ name: 'minutes', color: 'teal.solid', label: c.series.minutes }],
  })

  return (
    <ChartCard title={c.duration} info={c.durationInfo}>
      <Chart.Root aspectRatio="auto" chart={chart}>
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <BarChart data={chart.data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid {...gridStyle(chart)} />
            <XAxis
              dataKey={chart.key('date')}
              tickFormatter={(v: string) => v.slice(5)}
              {...axisStyle(chart)}
            />
            <YAxis allowDecimals={false} width={32} {...axisStyle(chart)} />
            <Tooltip cursor={BAR_CURSOR} content={<Chart.Tooltip />} />
            {chart.series.map((s) => (
              <Bar key={s.name} dataKey={chart.key(s.name)} fill={chart.color(s.color)} radius={4} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </Chart.Root>
    </ChartCard>
  )
}
