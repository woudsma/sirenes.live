import { Card } from '@chakra-ui/react'
import { Chart, useChart } from '@chakra-ui/charts'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { WeekHourCell } from '../types'
import { ChartTitle } from './ChartTitle'
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
    <Card.Root>
      <Card.Body>
        <ChartTitle info={c.weekdayInfo}>{c.weekday}</ChartTitle>
        <Chart.Root aspectRatio="auto" chart={chart}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chart.data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={chart.color('border.muted')} vertical={false} />
              <XAxis
                dataKey={chart.key('day')}
                stroke={chart.color('border')}
                tickLine={false}
                fontSize={11}
              />
              <YAxis
                allowDecimals={false}
                width={32}
                stroke={chart.color('border')}
                tickLine={false}
                fontSize={11}
              />
              <Tooltip cursor={{ fill: 'rgba(127,127,127,0.12)' }} content={<Chart.Tooltip />} />
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
      </Card.Body>
    </Card.Root>
  )
}
