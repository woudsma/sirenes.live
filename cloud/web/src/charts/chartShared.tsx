import type { ReactNode } from 'react'
import { Box, Card, Flex, Text } from '@chakra-ui/react'
import { ChartTitle } from './ChartTitle'
import { CHART_HEIGHT } from './chartStyles'

// Shared component shells for the dashboard charts — the titled card, the loading
// placeholder, and a tooltip card — so the individual charts only describe their
// data and series. Styling constants/helpers live in chartStyles.ts.

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
    <Box
      bg="bg.panel"
      borderWidth="1px"
      borderColor="border"
      rounded="md"
      px={3}
      py={2}
      shadow="md"
    >
      {children}
    </Box>
  )
}
