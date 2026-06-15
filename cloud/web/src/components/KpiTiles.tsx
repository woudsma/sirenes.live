import { Box, HStack, SimpleGrid, Stat, Text } from '@chakra-ui/react'
import type { CalendarDay, Kpis } from '../types'
import { formatDateLong, formatDateRange, formatDuration } from '../lib/format'
import { todayIso } from '../lib/date'
import { useLanguage, dashboardText, sirens } from '../i18n'
import { InfoTip } from './InfoTip'

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
  const { lang } = useLanguage()
  const k = dashboardText[lang].kpi
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
        title={k.totalSirens}
        left={{ value: today, label: k.today }}
        right={{ value: kpis.total, label: k.total }}
        info={k.totalInfo}
      />
      <TwoStatTile
        title={k.avgSirens}
        left={{ value: Math.floor(kpis.avgPerDay), label: k.perDay }}
        right={{ value: Math.floor(kpis.avgPerDay * 7), label: k.perWeek }}
        info={k.avgInfo}
      />
      <TwoStatTile
        title={k.totalTime}
        left={{ value: formatDuration(todaySeconds), label: k.today }}
        right={{ value: formatDuration(kpis.totalSeconds), label: k.total }}
        info={k.totalTimeInfo}
      />
      <TwoStatTile
        title={k.aSirenEvery}
        left={{ value: officeGap ? formatDuration(officeGap) : '—', label: '09–17h' }}
        right={{ value: dayGap ? formatDuration(dayGap) : '—', label: '07–23h' }}
        info={k.everyInfo}
      />
      <Tile
        label={k.busiestDay}
        value={bd.date ? formatDateLong(bd.date, lang) : '—'}
        help={sirens(bd.count, lang)}
        info={k.busiestDayInfo}
      />
      <Tile
        label={k.busiestHour}
        value={bh.date ? `${String(bh.hour).padStart(2, '0')}:00` : '—'}
        help={bh.date ? `${sirens(bh.count, lang)} · ${formatDateLong(bh.date, lang)}` : undefined}
        info={k.busiestHourInfo}
      />
      <Tile
        label={k.longestQuiet}
        value={kpis.longestQuietStreakS ? formatDuration(kpis.longestQuietStreakS) : '—'}
        help={
          kpis.quietStreak?.from && kpis.quietStreak?.to
            ? formatDateRange(kpis.quietStreak.from, kpis.quietStreak.to, lang)
            : undefined
        }
        info={k.longestQuietInfo}
      />
      <Tile
        label={k.avgNight}
        value={nightAvg.toFixed(1)}
        help={k.nightUnit}
        info={k.avgNightInfo}
      />
    </SimpleGrid>
  )
}
