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
import { useLanguage, infoText, dashboardText } from './i18n'
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
    markReviewed,
    seedDataset,
    unlock,
    setAdminToken,
    manageEnabled,
    adminToken,
  } = useCloud()

  const { lang, toggle } = useLanguage()
  const t = infoText[lang]
  const d = dashboardText[lang]

  const latestTs = events.events.length
    ? events.events.reduce((max, e) => Math.max(max, e.ts), 0)
    : null

  // Very rough all-time estimate since I moved in (early 2020): scale the
  // per-day averages collected so far across every day since then.
  const k = insights.kpis
  const daysSince2020 = Math.max(
    1,
    Math.round((Date.now() - new Date('2020-01-01').getTime()) / 86_400_000),
  )
  const nightTotal = stats.perHour.reduce((s, c, h) => (h < 7 || h >= 23 ? s + c : s), 0)
  const nightAvgPerDay = k.daysActive > 0 ? nightTotal / k.daysActive : 0
  const avgSecondsPerDay = k.daysActive > 0 ? k.totalSeconds / k.daysActive : 0
  const nf = lang === 'nl' ? 'nl-NL' : 'en-US'
  const estSirens = Math.round((k.avgPerDay * daysSince2020) / 100) * 100
  const estNightly = Math.round((nightAvgPerDay * daysSince2020) / 10) * 10
  const estHours = Math.round((avgSecondsPerDay * daysSince2020) / 3600)

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

        <Tabs.Root defaultValue="dashboard" variant="enclosed">
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
              <Button asChild size="sm" variant="outline">
                <a href="/api/events.csv" download>
                  <LuDownload /> {d.events.downloadCsv}
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
                  {t.why.title}
                </Heading>
                <Text fontSize="sm" color="fg.muted">
                  {t.why.body}
                </Text>
                <Text fontSize="sm" color="fg.muted" mt={3}>
                  {t.why.estIntro}
                </Text>
                <Stack gap={1} mt={3} fontSize="sm" fontVariantNumeric="tabular-nums">
                  <HStack justify="space-between">
                    <Text color="fg.muted">{t.why.estTotalSirens}</Text>
                    <Text fontWeight="medium">{estSirens.toLocaleString(nf)}</Text>
                  </HStack>
                  <HStack justify="space-between">
                    <Text color="fg.muted">{t.why.estTotalTime}</Text>
                    <Text fontWeight="medium">
                      {estHours.toLocaleString(nf)} {t.why.hoursUnit}
                    </Text>
                  </HStack>
                  <HStack justify="space-between">
                    <Text color="fg.muted">{t.why.estNightly}</Text>
                    <Text fontWeight="medium">{estNightly.toLocaleString(nf)}</Text>
                  </HStack>
                  <Box borderTopWidth="1px" my={1} />
                  <Text fontSize="xs" color="fg.subtle">
                    {t.why.estBasedOn(k.daysActive)}
                  </Text>
                </Stack>
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
