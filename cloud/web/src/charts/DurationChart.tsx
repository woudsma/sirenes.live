import { Card } from '@chakra-ui/react'
import { Chart, useChart } from '@chakra-ui/charts'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { CalendarDay } from '../types'
import { ChartTitle } from './ChartTitle'
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
    <Card.Root>
      <Card.Body>
        <ChartTitle info={c.durationInfo}>{c.duration}</ChartTitle>
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
