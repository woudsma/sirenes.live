import { Box, Button, Container, Heading, HStack, SimpleGrid, Tabs, Text } from '@chakra-ui/react'
import { useDevice } from './hooks/useDevice'
import { DbMeter } from './components/DbMeter'
import { StatusCard } from './components/StatusCard'
import { EventTable } from './components/EventTable'
import { SettingsPanel } from './components/SettingsPanel'
import { RecordPanel } from './components/RecordPanel'
import { PerDayChart } from './charts/PerDayChart'
import { TimeOfDayChart } from './charts/TimeOfDayChart'
import { LoudnessChart } from './charts/LoudnessChart'

export default function App() {
  const { status, stats, events, config, connected, usingMock, saveConfig, simulate, setDetecting, deleteEvent, clearEvents } =
    useDevice()

  return (
    <Box minH="100vh" bg="bg" color="fg">
      <Container maxW="6xl" py={{ base: 4, md: 8 }}>
        <HStack justify="space-between" align="start" mb={6} wrap="wrap" gap={3}>
          <Box>
            <Heading size="2xl">🚨 Siren Detector</Heading>
          </Box>
          {usingMock && (
            <Text
              fontSize="xs"
              color="orange.500"
              borderWidth="1px"
              borderColor="orange.500"
              rounded="md"
              px={2}
              py={1}
            >
              demo data — no device connected
            </Text>
          )}
        </HStack>

        <Tabs.Root defaultValue="dashboard" variant="enclosed">
          <Tabs.List>
            <Tabs.Trigger value="dashboard">Dashboard</Tabs.Trigger>
            <Tabs.Trigger value="events">Events</Tabs.Trigger>
            <Tabs.Trigger value="record">Record</Tabs.Trigger>
            <Tabs.Trigger value="settings">Settings</Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="dashboard">
            <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
              <StatusCard
                status={status}
                connected={connected}
                usingMock={usingMock}
                onSimulate={simulate}
                onToggleDetect={setDetecting}
              />
              <DbMeter status={status} />
            </SimpleGrid>

            <SimpleGrid columns={{ base: 1, lg: 2 }} gap={4} mt={4}>
              <PerDayChart data={stats.perDay} />
              <TimeOfDayChart perHour={stats.perHour} />
            </SimpleGrid>

            <SimpleGrid columns={{ base: 1, lg: 2 }} gap={4} mt={4}>
              <LoudnessChart data={stats.dbHistogram} />
              <EventTable events={events.events.slice(0, 8)} onDelete={deleteEvent} />
            </SimpleGrid>
          </Tabs.Content>

          <Tabs.Content value="events">
            <HStack justify="end" mb={3}>
              <Button asChild size="sm" variant="outline">
                <a href="/api/events.csv" download>
                  Download CSV
                </a>
              </Button>
            </HStack>
            <EventTable events={events.events} onDelete={deleteEvent} onClear={clearEvents} />
          </Tabs.Content>

          <Tabs.Content value="record">
            <RecordPanel connected={connected} />
          </Tabs.Content>

          <Tabs.Content value="settings">
            <SettingsPanel config={config} onSave={saveConfig} usingMock={usingMock} />
          </Tabs.Content>
        </Tabs.Root>
      </Container>
    </Box>
  )
}
