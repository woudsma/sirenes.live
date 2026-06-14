import { HStack, Text } from '@chakra-ui/react'
import { InfoTip } from '../components/InfoTip'

// Card title for a chart, with an "i" icon whose hover tooltip explains how the
// chart is calculated. Matches the standalone <Text> the charts used before.
export function ChartTitle({ children, info }: { children: string; info: string }) {
  return (
    <HStack gap={1} mb={2} align="center">
      <Text fontSize="sm" color="fg.muted" fontWeight="medium">
        {children}
      </Text>
      <InfoTip text={info} />
    </HStack>
  )
}
