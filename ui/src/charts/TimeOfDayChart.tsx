import { Card, Text } from '@chakra-ui/react'
import { Chart, useChart } from '@chakra-ui/charts'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export function TimeOfDayChart({ perHour }: { perHour: number[] }) {
  const data = perHour.map((count, hour) => ({
    hour: `${hour.toString().padStart(2, '0')}:00`,
    count,
  }))

  const chart = useChart({
    data,
    series: [{ name: 'count', color: 'orange.solid', label: 'Sirens' }],
  })

  return (
    <Card.Root>
      <Card.Body>
        <Text fontSize="sm" color="fg.muted" fontWeight="medium" mb={2}>
          Time of day
        </Text>
        <Chart.Root aspectRatio="auto" chart={chart}>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={chart.data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <defs>
                {chart.series.map((s) => (
                  <Chart.Gradient
                    key={s.name}
                    id={`tod-${s.name}`}
                    stops={[
                      { offset: '0%', color: s.color, opacity: 0.35 },
                      { offset: '100%', color: s.color, opacity: 0.02 },
                    ]}
                  />
                ))}
              </defs>
              <CartesianGrid stroke={chart.color('border.muted')} vertical={false} />
              <XAxis
                dataKey={chart.key('hour')}
                interval={2}
                stroke={chart.color('border')}
                tickLine={false}
                fontSize={11}
              />
              <YAxis allowDecimals={false} width={32} stroke={chart.color('border')} tickLine={false} fontSize={11} />
              <Tooltip cursor={false} content={<Chart.Tooltip />} />
              {chart.series.map((s) => (
                <Area
                  key={s.name}
                  type="monotone"
                  dataKey={chart.key(s.name)}
                  stroke={chart.color(s.color)}
                  fill={`url(#tod-${s.name})`}
                  strokeWidth={2}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </Chart.Root>
      </Card.Body>
    </Card.Root>
  )
}
