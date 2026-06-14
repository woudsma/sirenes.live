import {
  Box,
  Button,
  Container,
  Heading,
  HStack,
  Link,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
} from '@chakra-ui/react'
import { LuDownload } from 'react-icons/lu'
import { useCloud } from './hooks/useCloud'
import { ManageBar } from './components/ManageBar'
import { DevSeedToggle } from './components/DevSeedToggle'
import { EventTable } from './components/EventTable'
import { KpiTiles } from './components/KpiTiles'
import { LastSirenTimer } from './components/LastSirenTimer'
import { ObfuscatedEmail } from './components/ObfuscatedEmail'
import { PerDayChart } from './charts/PerDayChart'
import { TimeOfDayChart } from './charts/TimeOfDayChart'
import { WeekHourHeatmap } from './charts/WeekHourHeatmap'
import { WeekdayChart } from './charts/WeekdayChart'
import { CumulativeChart } from './charts/CumulativeChart'
import { DurationChart } from './charts/DurationChart'
import { TempCorrelationChart } from './charts/TempCorrelationChart'
import { ContributionsCalendar } from './charts/ContributionsCalendar'

export default function App() {
  const {
    stats,
    insights,
    events,
    loaded,
    error,
    deleteEvent,
    clearEvents,
    markReviewed,
    seedDataset,
    unlock,
    setAdminToken,
    manageEnabled,
    adminToken,
  } = useCloud()

  const latestTs = events.events.length
    ? events.events.reduce((max, e) => Math.max(max, e.ts), 0)
    : null

  return (
    <Box minH="100vh" bg="bg" color="fg">
      <Container as="main" maxW="6xl" py={{ base: 4, md: 8 }}>
        <HStack justify="space-between" align="start" mb={6} wrap="wrap" gap={3}>
          <Box>
            <Heading size="2xl">🚨 Siren Detector</Heading>
            <Text fontSize="sm" color="fg.muted">
              Listening from behind my window near OLVG West, Amsterdam
            </Text>
          </Box>
          <HStack gap={3} wrap="wrap">
            {import.meta.env.DEV && <DevSeedToggle onSeed={seedDataset} />}
            <ManageBar enabled={manageEnabled} onUnlock={unlock} onLock={() => setAdminToken('')} />
          </HStack>
        </HStack>

        {error && (
          <Text
            fontSize="xs"
            color="orange.500"
            borderWidth="1px"
            borderColor="orange.500"
            rounded="md"
            px={2}
            py={1}
            mb={4}
          >
            {error}
          </Text>
        )}

        <Tabs.Root defaultValue="dashboard" variant="enclosed">
          <HStack align="center" wrap="wrap" gap={4}>
            <Tabs.List>
              <Tabs.Trigger value="dashboard">Dashboard</Tabs.Trigger>
              <Tabs.Trigger value="events">Events</Tabs.Trigger>
              <Tabs.Trigger value="info">Info</Tabs.Trigger>
            </Tabs.List>
            <LastSirenTimer latestTs={latestTs} />
          </HStack>

          <Tabs.Content value="dashboard">
            <Stack gap={4}>
              <KpiTiles
                kpis={insights.kpis}
                today={stats.today}
                perHour={stats.perHour}
                calendar={insights.calendar}
              />
              <ContributionsCalendar calendar={insights.calendar} />
              <SimpleGrid columns={{ base: 1, lg: 2 }} gap={4}>
                <WeekHourHeatmap weekdayHourByWeek={insights.weekdayHourByWeek} />
                <TimeOfDayChart perHour={stats.perHour} />
                <PerDayChart data={stats.perDay} />
                <WeekdayChart weekdayHour={insights.weekdayHour} />
                <DurationChart calendar={insights.calendar} />
                <CumulativeChart calendar={insights.calendar} />
                <TempCorrelationChart calendar={insights.calendar} />
              </SimpleGrid>
            </Stack>
          </Tabs.Content>

          <Tabs.Content value="events">
            <HStack justify="end" mb={3}>
              <Button asChild size="sm" variant="outline">
                <a href="/api/events.csv" download>
                  <LuDownload /> Download CSV
                </a>
              </Button>
            </HStack>
            {loaded && (
              <EventTable
                events={events.events}
                unreviewed={events.unreviewed}
                adminToken={adminToken}
                onDelete={manageEnabled ? deleteEvent : undefined}
                onClear={manageEnabled ? clearEvents : undefined}
                onReview={manageEnabled ? markReviewed : undefined}
              />
            )}
          </Tabs.Content>

          <Tabs.Content value="info">
            <Stack gap={4} maxW="2xl">
              <Box borderWidth="1px" rounded="md" p={4}>
                <Heading size="md" mb={2}>
                  Why
                </Heading>
                <Text fontSize="sm" color="fg.muted">
                  I live near a hospital, so sirens are a constant. I wanted to quantify the
                  madness: how many pass by, when, and how loud.
                </Text>
              </Box>
              <Box borderWidth="1px" rounded="md" p={4}>
                <Heading size="md" mb={2}>
                  How accurate is this?
                </Heading>
                <Text fontSize="sm" color="fg.muted">
                  Detection isn't 100% accurate. The on-device model typically misses a few sirens a
                  day, and it only logs sirens that stay audible for at least 5 seconds, so brief or
                  distant ones won't be counted. The recorded loudness isn't accurate either. It's
                  an uncalibrated reading through a closed window, so treat it as a rough relative
                  measure, not a real dB level.
                </Text>
              </Box>
              <Box borderWidth="1px" rounded="md" p={4}>
                <Heading size="md" mb={2}>
                  How it works
                </Heading>
                <Text fontSize="sm" color="fg.muted">
                  An always-on{' '}
                  <Link
                    href="https://elektronicavoorjou.nl/product/esp32-development-board-wifi-bluetooth/"
                    target="_blank"
                    rel="noreferrer"
                    color="brand.500"
                  >
                    ESP32
                  </Link>{' '}
                  microcontroller with a small{' '}
                  <Link
                    href="https://www.adafruit.com/product/6049"
                    target="_blank"
                    rel="noreferrer"
                    color="brand.500"
                  >
                    MEMS microphone
                  </Link>{' '}
                  runs a TinyML model (trained with{' '}
                  <Link
                    href="https://www.edgeimpulse.com/"
                    target="_blank"
                    rel="noreferrer"
                    color="brand.500"
                  >
                    Edge Impulse
                  </Link>
                  ) that listens for emergency sirens. Each detection's time and loudness is logged
                  and sent to a self-hosted server, which stores the events and serves these graphs.
                </Text>
                <Text fontSize="sm" color="fg.muted" mt={3}>
                  The full source code (firmware, web UI, and server) is on{' '}
                  <Link
                    href="https://github.com/woudsma/sirenes.live"
                    target="_blank"
                    rel="noreferrer"
                    color="brand.500"
                  >
                    GitHub
                  </Link>
                  .
                </Text>
              </Box>
              <Box borderWidth="1px" rounded="md" p={4}>
                <Heading size="md" mb={2}>
                  Contact
                </Heading>
                <Text fontSize="sm" color="fg.muted">
                  Questions? Send me an <ObfuscatedEmail />.
                </Text>
              </Box>
            </Stack>
          </Tabs.Content>
        </Tabs.Root>
      </Container>
    </Box>
  )
}
