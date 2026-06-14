import { Card } from '@chakra-ui/react'
import { Chart, useChart } from '@chakra-ui/charts'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { CalendarDay } from '../types'
import { ChartTitle } from './ChartTitle'
import { useLanguage, dashboardText } from '../i18n'

// Running total of detections over time — the "impact" curve. A steeper slope
// means a busier stretch; the height is the cumulative count to date.
export function CumulativeChart({ calendar }: { calendar: CalendarDay[] }) {
  const { lang } = useLanguage()
  const c = dashboardText[lang].charts
  let running = 0
  const data = calendar.map((d) => {
    running += d.count
    return { date: d.date, total: running }
  })

  const chart = useChart({
    data,
    series: [{ name: 'total', color: 'brand.500', label: c.series.cumulative }],
  })

  return (
    <Card.Root>
      <Card.Body>
        <ChartTitle info={c.cumulativeInfo}>{c.cumulative}</ChartTitle>
        <Chart.Root aspectRatio="auto" chart={chart}>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={chart.data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <defs>
                {chart.series.map((s) => (
                  <Chart.Gradient
                    key={s.name}
                    id={`cum-${s.name}`}
                    stops={[
                      { offset: '0%', color: s.color, opacity: 0.35 },
                      { offset: '100%', color: s.color, opacity: 0.02 },
                    ]}
                  />
                ))}
              </defs>
              <CartesianGrid stroke={chart.color('border.muted')} vertical={false} />
              <XAxis
                dataKey={chart.key('date')}
                tickFormatter={(v: string) => v.slice(5)}
                minTickGap={28}
                stroke={chart.color('border')}
                tickLine={false}
                fontSize={11}
              />
              <YAxis
                allowDecimals={false}
                width={40}
                stroke={chart.color('border')}
                tickLine={false}
                fontSize={11}
              />
              <Tooltip cursor={false} content={<Chart.Tooltip />} />
              {chart.series.map((s) => (
                <Area
                  key={s.name}
                  type="monotone"
                  dataKey={chart.key(s.name)}
                  stroke={chart.color(s.color)}
                  fill={`url(#cum-${s.name})`}
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
