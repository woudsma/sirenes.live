import { Chart, useChart } from '@chakra-ui/charts'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { WeekHourCell } from '../types'
import { ChartCard, axisStyle, gridStyle, BAR_CURSOR, CHART_HEIGHT } from './chartShared'
import { useLanguage, dashboardText, DAY_SHORT } from '../i18n'

// Totals by weekday (Mon→Sun), derived from the weekday×hour cells. Shows the
// weekly rhythm — are weekdays noticeably busier than weekends?
const ORDER = [1, 2, 3, 4, 5, 6, 0] // Mon→Sun as the API's weekday index

export function WeekdayChart({ weekdayHour }: { weekdayHour: WeekHourCell[] }) {
  const { lang } = useLanguage()
  const c = dashboardText[lang].charts
  const totals = Array(7).fill(0)
  for (const cell of weekdayHour) totals[cell.weekday] += cell.count
  const data = ORDER.map((wd, i) => ({ day: DAY_SHORT[lang][i], count: totals[wd] }))

  const chart = useChart({
    data,
    series: [{ name: 'count', color: 'brand.500', label: c.series.sirens }],
  })

  return (
    <ChartCard title={c.weekday} info={c.weekdayInfo}>
      <Chart.Root aspectRatio="auto" chart={chart}>
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <BarChart data={chart.data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid {...gridStyle(chart)} />
            <XAxis dataKey={chart.key('day')} {...axisStyle(chart)} />
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
