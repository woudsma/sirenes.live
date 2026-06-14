import { Box, HStack, SimpleGrid, Stat, Text } from '@chakra-ui/react'
import type { CalendarDay, Kpis } from '../types'
import { formatDateLong, formatDateRange, formatDuration } from '../lib/format'
import { InfoTip } from './InfoTip'

// Local YYYY-MM-DD (avoids the UTC shift of toISOString).
function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Shared card header so every tile's value row starts at the same vertical
// position (the Today/Total cards use the same markup). An optional `info` adds
// an "i" icon with a hover tooltip explaining the stat.
function TileTitle({ children, info }: { children: string; info?: string }) {
  return (
    <HStack gap={1} mb={2} align="center">
      <Text fontSize="sm" color="fg.muted" fontWeight="medium">
        {children}
      </Text>
      {info && <InfoTip text={info} />}
    </HStack>
  )
}

// Headline numbers for the report dashboard. Same tile pattern as the Today/Total
// cards, just more of them.
function Tile({
  label,
  value,
  help,
  info,
}: {
  label: string
  value: string | number
  help?: string
  info?: string
}) {
  return (
    <Box borderWidth="1px" rounded="md" p={4}>
      <TileTitle info={info}>{label}</TileTitle>
      <Stat.Root>
        <Stat.ValueText>{value}</Stat.ValueText>
        {help && <Stat.HelpText mb={0}>{help}</Stat.HelpText>}
      </Stat.Root>
    </Box>
  )
}

// Two related numbers share one tile, side by side, under a card title that says
// what's being measured. Each value sits above its own label.
function TwoStatTile({
  title,
  left,
  right,
  info,
}: {
  title: string
  left: { value: string | number; label: string }
  right: { value: string | number; label: string }
  info?: string
}) {
  return (
    <Box borderWidth="1px" rounded="md" p={4}>
      <TileTitle info={info}>{title}</TileTitle>
      <HStack gap={6} align="start">
        <Stat.Root>
          <Stat.ValueText>{left.value}</Stat.ValueText>
          <Stat.Label>{left.label}</Stat.Label>
        </Stat.Root>
        <Stat.Root>
          <Stat.ValueText>{right.value}</Stat.ValueText>
          <Stat.Label>{right.label}</Stat.Label>
        </Stat.Root>
      </HStack>
    </Box>
  )
}

const DAY_START = 7 // 07:00
const DAY_END = 23 // 23:00
const NIGHT = (h: number) => h < DAY_START || h >= DAY_END

const OFFICE_START = 9 // 09:00
const OFFICE_END = 17 // 17:00

// Average gap between sirens in a [start, end) hour window: the window length
// divided by the average number of sirens that fall in it per active day.
function avgGap(perHour: number[], daysActive: number, start: number, end: number): number {
  const total = perHour.reduce((s, c, h) => (h >= start && h < end ? s + c : s), 0)
  const perDay = daysActive > 0 ? total / daysActive : 0
  return perDay > 0 ? ((end - start) * 3600) / perDay : 0
}

export function KpiTiles({
  kpis,
  today,
  perHour,
  calendar,
}: {
  kpis: Kpis
  today: number
  perHour: number[]
  calendar: CalendarDay[]
}) {
  const bd = kpis.busiestDay
  const bh = kpis.busiestHour
  const iso = todayIso()
  const todaySeconds = calendar.find((d) => d.date === iso)?.totalSeconds ?? 0
  // Average gap between sirens during the day (07–23h) and during office hours (09–17h).
  const dayGap = avgGap(perHour, kpis.daysActive, DAY_START, DAY_END)
  const officeGap = avgGap(perHour, kpis.daysActive, OFFICE_START, OFFICE_END)
  // Average number of nighttime sirens per active day.
  const nightTotal = perHour.reduce((s, c, h) => (NIGHT(h) ? s + c : s), 0)
  const nightAvg = kpis.daysActive > 0 ? nightTotal / kpis.daysActive : 0

  return (
    <SimpleGrid columns={{ base: 2, md: 4 }} gap={4}>
      <TwoStatTile
        title="Total sirens"
        left={{ value: today, label: 'Today' }}
        right={{ value: kpis.total, label: 'Total' }}
        info="Number of sirens detected today and since the device started counting."
      />
      <TwoStatTile
        title="Average sirens"
        left={{ value: Math.floor(kpis.avgPerDay), label: 'Per day' }}
        right={{ value: Math.floor(kpis.avgPerDay * 7), label: 'Per week' }}
        info="All-time siren count divided by the number of days with at least one detection, shown per day and as a per-week rate (× 7)."
      />
      <TwoStatTile
        title="Total siren time"
        left={{ value: formatDuration(todaySeconds), label: 'Today' }}
        right={{ value: formatDuration(kpis.totalSeconds), label: 'Total' }}
        info="Combined duration of every detected siren — for today and all-time."
      />
      <TwoStatTile
        title="A siren every"
        left={{ value: officeGap ? formatDuration(officeGap) : '—', label: '09–17h' }}
        right={{ value: dayGap ? formatDuration(dayGap) : '—', label: '07–23h' }}
        info="Average time between sirens in each window: the window length divided by the average number of sirens detected in it per active day. 07–23h is daytime, 09–17h is office hours."
      />
      <Tile
        label="Busiest day"
        value={bd.date ? formatDateLong(bd.date) : '—'}
        help={`${bd.count} sirens`}
        info="The single calendar day with the most detections, and how many there were."
      />
      <Tile
        label="Busiest hour"
        value={bh.date ? `${String(bh.hour).padStart(2, '0')}:00` : '—'}
        help={bh.date ? `${bh.count} sirens · ${formatDateLong(bh.date)}` : undefined}
        info="The single hour on a single day with the most detections — the date and the number of sirens in that one-hour window."
      />
      <Tile
        label="Longest quiet streak"
        value={kpis.longestQuietStreakS ? formatDuration(kpis.longestQuietStreakS) : '—'}
        help={
          kpis.quietStreak?.from && kpis.quietStreak?.to
            ? formatDateRange(kpis.quietStreak.from, kpis.quietStreak.to)
            : undefined
        }
        info="The longest stretch of daytime with no sirens — the biggest gap between two consecutive detections (counting only 07:00–23:00 and skipping the nights between), and the dates it spanned."
      />
      <Tile
        label="Average sirens at night"
        value={nightAvg.toFixed(1)}
        help="23:00–07:00 / day"
        info="Average number of sirens between 23:00 and 07:00 per active day."
      />
    </SimpleGrid>
  )
}
