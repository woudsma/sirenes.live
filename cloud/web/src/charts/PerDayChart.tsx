import { Card } from '@chakra-ui/react'
import { Chart, useChart } from '@chakra-ui/charts'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { PerDay } from '../types'
import { ChartTitle } from './ChartTitle'

export function PerDayChart({ data }: { data: PerDay[] }) {
  const chart = useChart({
    data,
    series: [{ name: 'count', color: 'brand.500', label: 'Sirens' }],
  })

  return (
    <Card.Root>
      <Card.Body>
        <ChartTitle info="One bar per calendar day; its height is the number of separate siren events detected that day (local time).">
          Sirens per day
        </ChartTitle>
        <Chart.Root aspectRatio="auto" chart={chart}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chart.data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={chart.color('border.muted')} vertical={false} />
              <XAxis
                dataKey={chart.key('date')}
                tickFormatter={(v: string) => v.slice(5)}
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
