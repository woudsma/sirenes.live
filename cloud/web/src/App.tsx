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
import { useMemo, useState } from 'react'
import { LuDownload, LuFilter, LuPlus } from 'react-icons/lu'
import { useCloud } from './hooks/useCloud'
import { useRoute } from './hooks/useRoute'
import { useLanguage, infoText, dashboardText } from './i18n'
import { ManageBar } from './components/ManageBar'
import { DevSeedToggle } from './components/DevSeedToggle'
import { DowntimePanel } from './components/DowntimePanel'
import { EventFilter, type FilterCriteria } from './components/EventFilter'
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
import { WeatherCorrelationChart } from './charts/WeatherCorrelationChart'
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
    setClipVisible,
    downtime,
    addDowntime,
    deleteDowntime,
    seedDataset,
    unlock,
    setAdminToken,
    manageEnabled,
    adminToken,
  } = useCloud()

  const { lang, toggle } = useLanguage()
  const t = infoText[lang]
  const d = dashboardText[lang]
  const [tab, navigate] = useRoute()
  const [addingDowntime, setAddingDowntime] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [criteria, setCriteria] = useState<FilterCriteria>({
    from: '',
    to: '',
    unreviewedOnly: false,
  })

  const latestTs = events.events.length
    ? events.events.reduce((max, e) => Math.max(max, e.ts), 0)
    : null

  // Client-side filter over the fully-loaded history. datetime-local strings are
  // converted to unix seconds in browser-local time (matches server bucketing).
  // The unreviewed filter only applies for admins (the chip is admin-only).
  const unreviewedOnly = criteria.unreviewedOnly && manageEnabled
  const filteredEvents = useMemo(() => {
    const fromTs = criteria.from ? Math.floor(new Date(criteria.from).getTime() / 1000) : -Infinity
    const toTs = criteria.to ? Math.floor(new Date(criteria.to).getTime() / 1000) : Infinity
    return events.events.filter(
      (e) => e.ts >= fromTs && e.ts <= toTs && (!unreviewedOnly || !e.reviewed)
    )
  }, [events.events, criteria.from, criteria.to, unreviewedOnly])
  const filterActive = !!criteria.from || !!criteria.to || unreviewedOnly
  const filteredUnreviewed = filteredEvents.filter((e) => !e.reviewed).length

  return (
    <Box minH="100vh" bg="bg" color="fg" position="relative">
      <Button
        size="sm"
        variant="outline"
        onClick={toggle}
        aria-label="Toggle language"
        position="absolute"
        top={3}
        right={3}
        zIndex="docked"
        bg="bg"
      >
        {lang === 'en' ? '🇳🇱 NL' : '🇬🇧 EN'}
      </Button>
      <Container as="main" maxW="6xl" py={{ base: 4, md: 8 }}>
        <HStack justify="space-between" align="start" mb={6} wrap="wrap" gap={3}>
          <Box>
            <Heading size="2xl">🚨 {d.heading}</Heading>
            <Text fontSize="sm" color="fg.muted">
              {d.subtitle}
            </Text>
          </Box>
          {import.meta.env.DEV && (
            <HStack gap={3} wrap="wrap">
              <DevSeedToggle onSeed={seedDataset} />
            </HStack>
          )}
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

        <Tabs.Root
          value={tab}
          onValueChange={(e) => navigate(e.value as 'dashboard' | 'events' | 'info')}
          variant="enclosed"
        >
          <HStack align="center" wrap="wrap" gap={4}>
            <Tabs.List>
              <Tabs.Trigger value="dashboard">{d.tabs.dashboard}</Tabs.Trigger>
              <Tabs.Trigger value="events">{d.tabs.events}</Tabs.Trigger>
              <Tabs.Trigger value="info">{d.tabs.info}</Tabs.Trigger>
            </Tabs.List>
            <LastSirenTimer latestTs={latestTs} />
          </HStack>

          <Tabs.Content value="dashboard">
            <Stack gap={4}>
              <KpiTiles
                kpis={insights.kpis}
                today={stats.today}
                perHour={insights.perHourClean}
                calendar={insights.calendar}
              />
              <ContributionsCalendar calendar={insights.calendar} downtime={insights.downtime} />
              <SimpleGrid columns={{ base: 1, lg: 2 }} gap={4}>
                <WeekHourHeatmap
                  weekdayHourByWeek={insights.weekdayHourByWeek}
                  downtime={insights.downtime}
                />
                <TimeOfDayChart perHour={stats.perHour} />
                <PerDayChart data={stats.perDay} />
                <WeekdayChart weekdayHour={insights.weekdayHour} />
                <DurationChart calendar={insights.calendar} />
                <CumulativeChart calendar={insights.calendar} />
                <TempCorrelationChart calendar={insights.calendar} />
                <WeatherCorrelationChart calendar={insights.calendar} />
              </SimpleGrid>
            </Stack>
          </Tabs.Content>

          <Tabs.Content value="events">
            <HStack justify="end" align="center" gap={3} mb={3}>
              <ManageBar
                enabled={manageEnabled}
                onUnlock={unlock}
                onLock={() => setAdminToken('')}
              />
              <Button
                size="sm"
                variant="outline"
                colorPalette={filterActive ? 'brand' : undefined}
                onClick={() => setFilterOpen((v) => !v)}
              >
                <LuFilter /> {d.events.filter.button}
              </Button>
              {manageEnabled && (
                <Button size="sm" variant="outline" onClick={() => setAddingDowntime((v) => !v)}>
                  <LuPlus /> {d.downtime.addButton}
                </Button>
              )}
              <Button asChild size="sm" variant="outline">
                <a href="/api/events.csv" download>
                  <LuDownload /> {d.events.downloadCsv}
                </a>
              </Button>
            </HStack>
            <EventFilter
              open={filterOpen}
              criteria={criteria}
              onChange={setCriteria}
              adminEnabled={manageEnabled}
              matched={filteredEvents.length}
              total={events.events.length}
            />
            {manageEnabled && (
              <DowntimePanel
                downtime={downtime}
                adding={addingDowntime}
                onAddingChange={setAddingDowntime}
                onAdd={addDowntime}
                onDelete={deleteDowntime}
              />
            )}
            {loaded && (
              <EventTable
                events={filteredEvents}
                unreviewed={filteredUnreviewed}
                adminToken={adminToken}
                emptyMessage={filterActive ? d.events.filter.noMatches : undefined}
                onDelete={manageEnabled ? deleteEvent : undefined}
                onClear={manageEnabled ? clearEvents : undefined}
                onSetVisible={manageEnabled ? setClipVisible : undefined}
              />
            )}
          </Tabs.Content>

          <Tabs.Content value="info">
            <Stack gap={4} maxW="2xl">
              <Box borderWidth="1px" rounded="md" p={4}>
                <Heading size="md" mb={2}>
                  {t.why.title}
                </Heading>
                <Text fontSize="sm" color="fg.muted">
                  {t.why.body}
                </Text>
              </Box>
              <Box borderWidth="1px" rounded="md" p={4}>
                <Heading size="md" mb={2}>
                  {t.accuracy.title}
                </Heading>
                <Text fontSize="sm" color="fg.muted">
                  {t.accuracy.body}
                </Text>
              </Box>
              <Box borderWidth="1px" rounded="md" p={4}>
                <Heading size="md" mb={2}>
                  {t.privacy.title}
                </Heading>
                <Text fontSize="sm" color="fg.muted">
                  {t.privacy.body}
                </Text>
              </Box>
              <Box borderWidth="1px" rounded="md" p={4}>
                <Heading size="md" mb={2}>
                  {t.howItWorks.title}
                </Heading>
                <Text fontSize="sm" color="fg.muted">
                  {t.howItWorks.p1a}
                  <Link
                    href="https://elektronicavoorjou.nl/product/esp32-development-board-wifi-bluetooth/"
                    target="_blank"
                    rel="noreferrer"
                    color="brand.500"
                  >
                    ESP32
                  </Link>
                  {t.howItWorks.p1b}
                  <Link
                    href="https://www.adafruit.com/product/6049"
                    target="_blank"
                    rel="noreferrer"
                    color="brand.500"
                  >
                    MEMS microphone
                  </Link>
                  {t.howItWorks.p1c}
                  <Link
                    href="https://www.edgeimpulse.com/"
                    target="_blank"
                    rel="noreferrer"
                    color="brand.500"
                  >
                    Edge Impulse
                  </Link>
                  {t.howItWorks.p1d}
                </Text>
                <Text fontSize="sm" color="fg.muted" mt={3}>
                  {t.howItWorks.p2a}
                  <Link
                    href="https://github.com/woudsma/sirenes.live"
                    target="_blank"
                    rel="noreferrer"
                    color="brand.500"
                  >
                    GitHub
                  </Link>
                  {t.howItWorks.p2b}
                </Text>
              </Box>
              <Box borderWidth="1px" rounded="md" p={4}>
                <Heading size="md" mb={2}>
                  {t.contact.title}
                </Heading>
                <Text fontSize="sm" color="fg.muted">
                  {t.contact.before}
                  <ObfuscatedEmail label={t.contact.emailLabel} />
                  {t.contact.after}
                </Text>
              </Box>
            </Stack>
          </Tabs.Content>
        </Tabs.Root>
      </Container>
    </Box>
  )
}
