import { Chart, useChart } from '@chakra-ui/charts'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { PerDay } from '../types'
import { ChartCard, axisStyle, gridStyle, BAR_CURSOR, CHART_HEIGHT } from './chartShared'
import { useLanguage, dashboardText } from '../i18n'

export function PerDayChart({ data }: { data: PerDay[] }) {
  const { lang } = useLanguage()
  const c = dashboardText[lang].charts
  const chart = useChart({
    data,
    series: [{ name: 'count', color: 'brand.500', label: c.series.sirens }],
  })

  return (
    <ChartCard title={c.perDay} info={c.perDayInfo}>
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
