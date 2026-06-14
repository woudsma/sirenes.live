import { Badge, Box, Button, Card, HStack, SimpleGrid, Stack, Stat, Text } from '@chakra-ui/react'
import { LuPause, LuPlay } from 'react-icons/lu'
import type { Status } from '../types'

function formatUptime(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

const formatKB = (bytes: number): string => `${Math.round(bytes / 1024)} KB`

// A label + "free / total" row with a thin used-fraction bar. `health` enables
// warning colors as it fills — used for storage (near-full is a real problem)
// but not RAM, where running ~75% used is normal on the ESP32 with the model loaded.
function UsageRow({
  label,
  free,
  total,
  health = false,
}: {
  label: string
  free: number
  total: number
  health?: boolean
}) {
  const used = Math.max(0, total - free)
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0
  const fill = !health ? 'fg.muted' : pct >= 90 ? 'red.500' : pct >= 75 ? 'orange.400' : 'green.500'
  return (
    <Box>
      <HStack justify="space-between" mb="1">
        <Text fontSize="xs" color="fg.muted">
          {label}
        </Text>
        <Text fontSize="xs" color="fg" fontWeight="medium">
          {formatKB(free)} free{' '}
          <Text as="span" color="fg.subtle" fontWeight="normal">
            / {formatKB(total)}
          </Text>
        </Text>
      </HStack>
      <Box h="1.5" w="full" bg="bg.muted" rounded="full" overflow="hidden">
        <Box h="full" w={`${pct}%`} bg={fill} rounded="full" transition="width 0.3s ease" />
      </Box>
    </Box>
  )
}

interface Props {
  status: Status | null
  connected: boolean
  usingMock: boolean
  onSimulate: () => void
  onToggleDetect: (enabled: boolean) => void
}

export function StatusCard({ status, connected, usingMock, onSimulate, onToggleDetect }: Props) {
  const paused = !!status?.paused
  return (
    <Card.Root h="full">
      <Card.Body>
        <HStack justify="space-between" align="center" mb="2">
          <HStack gap="2">
            <Box
              boxSize="2"
              rounded="full"
              bg={!connected ? 'gray.500' : paused ? 'orange.400' : 'green.500'}
              aria-hidden
            />
            <Text fontSize="sm" color="fg.muted" fontWeight="medium">
              Device
            </Text>
            {paused ? (
              <Badge size="sm" colorPalette="orange" variant="subtle">
                paused
              </Badge>
            ) : (
              <Text fontSize="xs" color="fg.subtle">
                {connected ? 'connected' : usingMock ? 'demo' : 'offline'}
              </Text>
            )}
          </HStack>
          <HStack gap="1">
            <Button
              size="xs"
              variant="ghost"
              colorPalette={paused ? 'green' : 'orange'}
              onClick={() => onToggleDetect(paused)}
            >
              {paused ? <LuPlay /> : <LuPause />}
              {paused ? 'Resume' : 'Pause'}
            </Button>
            <Button size="xs" variant="ghost" colorPalette="purple" onClick={onSimulate}>
              Simulate
            </Button>
          </HStack>
        </HStack>

        <SimpleGrid columns={2} gap="4">
          <Stat.Root>
            <Stat.Label>Today</Stat.Label>
            <Stat.ValueText>{status?.today ?? 0}</Stat.ValueText>
          </Stat.Root>
          <Stat.Root>
            <Stat.Label>Total</Stat.Label>
            <Stat.ValueText>{status?.total ?? 0}</Stat.ValueText>
          </Stat.Root>
        </SimpleGrid>

        <Stack gap="2" mt="3">
          <HStack justify="space-between">
            <Text fontSize="xs" color="fg.muted">
              Uptime
            </Text>
            <Text fontSize="xs" color="fg" fontWeight="medium">
              {status ? formatUptime(status.uptimeS) : '—'}
            </Text>
          </HStack>
          <HStack justify="space-between">
            <Text fontSize="xs" color="fg.muted">
              Clock
            </Text>
            <Text
              fontSize="xs"
              color={status?.timeValid ? 'green.500' : 'fg.subtle'}
              fontWeight="medium"
            >
              {status?.timeValid ? 'NTP synced' : 'not synced'}
            </Text>
          </HStack>
          {status?.freeHeap != null && status.heapSize != null && (
            <UsageRow label="RAM" free={status.freeHeap} total={status.heapSize} />
          )}
          {status?.fsUsed != null && status.fsTotal != null && (
            <UsageRow
              label="Storage"
              free={status.fsTotal - status.fsUsed}
              total={status.fsTotal}
              health
            />
          )}
          <Text fontSize="xs" color="fg.subtle" pt="0.5">
            {status?.host ?? 'siren-detector.local'}
          </Text>
        </Stack>
      </Card.Body>
    </Card.Root>
  )
}
