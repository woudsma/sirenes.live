import { useEffect, useState } from 'react'
import { Badge, Box, Card, HStack, Text, VStack } from '@chakra-ui/react'
import { useChart } from '@chakra-ui/charts'
import { Line, LineChart, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import type { Status } from '../types'

const DB_MIN = 30
const DB_MAX = 100
const WINDOW_MS = 60_000 // show the last ~60 s
const MAX_POINTS = 180
const X_AXIS_H = 24 // keep the meter and chart plot bottoms aligned

function levelColor(db: number): string {
  if (db < 70) return 'green.500'
  if (db < 85) return 'yellow.500'
  if (db < 95) return 'orange.500'
  return 'red.500'
}

interface Point {
  t: number
  db: number
}

export function DbMeter({ status }: { status: Status | null }) {
  const db = status?.db ?? 0
  const pct = Math.max(0, Math.min(100, ((db - DB_MIN) / (DB_MAX - DB_MIN)) * 100))
  const color = levelColor(db)
  const detecting = status?.detecting ?? false
  // Cat is a display-only indicator; siren takes priority over it in the badge.
  const catActive = (status?.cat ?? false) && !detecting

  // Siren-likelihood score (0..1) as a thin companion meter.
  const scorePct = Math.max(0, Math.min(100, (status?.score ?? 0) * 100))

  // Rolling history of recent dB samples, fed by the live status stream.
  const [history, setHistory] = useState<Point[]>([])
  useEffect(() => {
    if (!status) return
    setHistory((prev) => {
      const now = Date.now()
      const next = [...prev, { t: now, db: status.db }].filter((p) => p.t >= now - WINDOW_MS)
      return next.length > MAX_POINTS ? next.slice(next.length - MAX_POINTS) : next
    })
  }, [status])

  const chart = useChart({ data: history, series: [{ name: 'db', color: 'teal.solid' }] })

  return (
    <Card.Root h="full">
      <Card.Body flex="1" display="flex" flexDirection="column">
        <HStack justify="space-between" align="start" mb={3}>
          <Text fontSize="sm" color="fg.muted" fontWeight="medium">
            Live sound level
          </Text>
          {detecting ? (
            <Badge colorPalette="purple" variant="solid">
              SIREN
            </Badge>
          ) : catActive ? (
            <Badge colorPalette="orange" variant="solid">
              CAT
            </Badge>
          ) : (
            <Badge colorPalette="green" variant="subtle">
              listening
            </Badge>
          )}
        </HStack>

        <HStack align="stretch" gap={4} flex="1" minH="190px">
          {/* Loudness over time (~75%) */}
          <Box flex="3" minW="0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
                <XAxis
                  dataKey="t"
                  type="number"
                  scale="time"
                  height={X_AXIS_H}
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(t: number) =>
                    new Date(t).toLocaleTimeString([], { minute: '2-digit', second: '2-digit' })
                  }
                  minTickGap={48}
                  stroke={chart.color('border')}
                  fontSize={10}
                  tickLine={false}
                />
                <YAxis
                  domain={[DB_MIN, DB_MAX]}
                  ticks={[40, 60, 80, 100]}
                  width={34}
                  stroke={chart.color('border')}
                  fontSize={10}
                  tickLine={false}
                />
                <Line
                  dataKey="db"
                  type="monotone"
                  stroke={chart.color('teal.solid')}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </Box>

          {/* Vertical meter (~25%) — bar aligned to the chart plot, value at the bottom */}
          <VStack flex="1" gap={0} minW="56px" h="full">
            <Box flex="1" w="full" pt="6px" display="flex" justifyContent="center">
              <Box
                position="relative"
                w="8"
                h="full"
                bg="bg.muted"
                rounded="md"
                overflow="hidden"
              >
                <Box
                  position="absolute"
                  bottom="0"
                  left="0"
                  right="0"
                  h={`${pct}%`}
                  bg={color}
                  transition="height 0.2s ease, background 0.3s ease"
                />
              </Box>
            </Box>
            <HStack h={`${X_AXIS_H}px`} align="baseline" justify="center" gap={1} mt={2}>
              <Text fontSize="xl" fontWeight="bold" lineHeight="1">
                {db.toFixed(0)}
              </Text>
              <Text fontSize="xs" color="fg.muted">
                dB
              </Text>
            </HStack>
          </VStack>

          {/* Thin siren-score meter — fill = likelihood, value at the bottom */}
          <VStack flex="0 0 auto" gap={0} minW="34px" h="full">
            <Box flex="1" w="full" pt="6px" display="flex" justifyContent="center">
              <Box
                position="relative"
                w="3"
                h="full"
                bg="bg.muted"
                rounded="md"
                overflow="hidden"
              >
                <Box
                  position="absolute"
                  bottom="0"
                  left="0"
                  right="0"
                  h={`${scorePct}%`}
                  bg={detecting ? 'purple.500' : 'purple.400'}
                  transition="height 0.2s ease, background 0.3s ease"
                />
              </Box>
            </Box>
            <HStack h={`${X_AXIS_H}px`} align="baseline" justify="center" gap={0.5} mt={2}>
              <Text fontSize="xl" fontWeight="bold" lineHeight="1">
                {scorePct.toFixed(0)}
              </Text>
              <Text fontSize="xs" color="fg.muted">
                %
              </Text>
            </HStack>
          </VStack>
        </HStack>
      </Card.Body>
    </Card.Root>
  )
}
