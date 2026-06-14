import { Card } from '@chakra-ui/react'
import { Chart, useChart } from '@chakra-ui/charts'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { WeekHourCell } from '../types'
import { ChartTitle } from './ChartTitle'

// Totals by weekday (Mon→Sun), derived from the weekday×hour cells. Shows the
// weekly rhythm — are weekdays noticeably busier than weekends?
const ORDER = [
  { label: 'Mon', wd: 1 },
  { label: 'Tue', wd: 2 },
  { label: 'Wed', wd: 3 },
  { label: 'Thu', wd: 4 },
  { label: 'Fri', wd: 5 },
  { label: 'Sat', wd: 6 },
  { label: 'Sun', wd: 0 },
]

export function WeekdayChart({ weekdayHour }: { weekdayHour: WeekHourCell[] }) {
  const totals = Array(7).fill(0)
  for (const c of weekdayHour) totals[c.weekday] += c.count
  const data = ORDER.map((o) => ({ day: o.label, count: totals[o.wd] }))

  const chart = useChart({
    data,
    series: [{ name: 'count', color: 'brand.500', label: 'Sirens' }],
  })

  return (
    <Card.Root>
      <Card.Body>
        <ChartTitle info="Each detection's start time is grouped by day of the week (Mon–Sun) and summed across every week in range — so a tall Monday bar means many sirens across all Mondays combined.">
          Sirens by weekday
        </ChartTitle>
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
