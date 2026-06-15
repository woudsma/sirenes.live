import type { ReactNode } from 'react'
import { Box, Card, Flex, Text } from '@chakra-ui/react'
import { ChartTitle } from './ChartTitle'

// Shared building blocks for the dashboard charts — the titled card shell, the
// loading placeholder, a tooltip card, and the common axis/grid styling — so the
// individual charts only describe their data and series.

// Pixel height every dashboard chart renders at.
export const CHART_HEIGHT = 240

// Neutral hover cursor for bar charts (theme-agnostic, works in light + dark).
export const BAR_CURSOR = { fill: 'rgba(127,127,127,0.12)' }

type ChartColor = { color: (token: string) => string }

// XAxis/YAxis styling: muted stroke, no tick lines, small labels.
export function axisStyle(chart: ChartColor) {
  return { stroke: chart.color('border'), tickLine: false as const, fontSize: 11 }
}

// CartesianGrid styling: muted horizontal-only grid lines.
export function gridStyle(chart: ChartColor) {
  return { stroke: chart.color('border.muted'), vertical: false as const }
}

// Titled panel (with an info tooltip) that every dashboard chart sits in.
export function ChartCard({
  title,
  info,
  children,
}: {
  title: string
  info: string
  children: ReactNode
}) {
  return (
    <Card.Root>
      <Card.Body>
        <ChartTitle info={info}>{title}</ChartTitle>
        {children}
      </Card.Body>
    </Card.Root>
  )
}

// Centered placeholder shown in place of a chart while its data isn't ready yet
// (e.g. weather still being fetched).
export function ChartEmpty({ children }: { children: ReactNode }) {
  return (
    <Flex h={`${CHART_HEIGHT}px`} align="center" justify="center">
      <Text fontSize="sm" color="fg.muted">
        {children}
      </Text>
    </Flex>
  )
}

// Small floating card for a chart's custom hover tooltip.
export function ChartTooltipCard({ children }: { children: ReactNode }) {
  return (
    <Box bg="bg.panel" borderWidth="1px" borderColor="border" rounded="md" px={3} py={2} shadow="md">
      {children}
    </Box>
  )
}
