import { Card, Text } from '@chakra-ui/react'
import { Chart, useChart } from '@chakra-ui/charts'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { DbBin } from '../types'

export function LoudnessChart({ data }: { data: DbBin[] }) {
  const chart = useChart({
    data,
    series: [{ name: 'count', color: 'teal.solid', label: 'Events' }],
  })

  return (
    <Card.Root>
      <Card.Body>
        <Text fontSize="sm" color="fg.muted" fontWeight="medium" mb={2}>
          Loudness distribution (peak dB)
        </Text>
        <Chart.Root aspectRatio="auto" chart={chart}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chart.data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={chart.color('border.muted')} vertical={false} />
              <XAxis dataKey={chart.key('bin')} stroke={chart.color('border')} tickLine={false} fontSize={11} />
              <YAxis allowDecimals={false} width={32} stroke={chart.color('border')} tickLine={false} fontSize={11} />
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
