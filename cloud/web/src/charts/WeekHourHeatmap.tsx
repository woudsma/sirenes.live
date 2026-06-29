import { useMemo, useState } from 'react'
import { Box, Card, Flex, HStack, NativeSelect, Portal, Text, Tooltip } from '@chakra-ui/react'
import type { Downtime, WeekHourWeekCell } from '../types'
import { heatColor, HEAT_DOWNTIME } from '../lib/heatmap'
import { downtimeAt } from '../lib/downtime'
import { isoDate, parseIso, addDays } from '../lib/date'
import { formatDateLong, formatDateRange } from '../lib/format'
import { InfoTip } from '../components/InfoTip'
import { useLanguage, dashboardText, sirens, DAY_SHORT, DAY_FULL } from '../i18n'

// Rolling weekday × hour punchcard for a 7-day window: one row per day (oldest at
// the top, the window's last day at the bottom) × 24 columns (hours), darker =
// more sirens. The default window ends today and slides up by one day as each new
// day begins, so it's always full. The dropdown steps the window back 7 days at a
// time to browse earlier weeks. Cells flex to fill the card width (kept square,
// with a max so they don't grow too large). Each has a hover tooltip with the day
// + time, portaled so nothing clips it.

const GAP = 3 // px
const AXIS_W = 32 // px, left label column
const DAYS = 7

function HeatCell({
  dayLabel,
  hour,
  count,
  max,
  lang,
  downtime,
  noDataLabel,
}: {
  dayLabel: string
  hour: number
  count: number
  max: number
  lang: 'en' | 'nl'
  downtime?: Downtime
  noDataLabel: string
}) {
  const time = `${dayLabel} ${String(hour).padStart(2, '0')}:00`
  // Mark a downtime hour only when it caught nothing — a cell with detections had
  // data, so it keeps its normal heat colour.
  const isDown = downtime && count === 0
  const label = isDown
    ? `${time} — ${noDataLabel}${downtime.reason ? ` (${downtime.reason})` : ''}`
    : `${time} — ${sirens(count, lang)}`
  return (
    <Tooltip.Root
      openDelay={100}
      closeDelay={50}
      lazyMount
      unmountOnExit
      positioning={{ placement: 'top' }}
    >
      <Tooltip.Trigger asChild>
        <Box
          flex="1"
          aspectRatio="1"
          maxW="28px"
          rounded="2px"
          bg={isDown ? HEAT_DOWNTIME : heatColor(count, max)}
          cursor="default"
        />
      </Tooltip.Trigger>
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content fontSize="xs">{label}</Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    </Tooltip.Root>
  )
}

export function WeekHourHeatmap({
  weekdayHourByWeek = [],
  downtime = [],
}: {
  weekdayHourByWeek?: WeekHourWeekCell[]
  downtime?: Downtime[]
}) {
  const { lang } = useLanguage()
  const c = dashboardText[lang].charts
  const noDataLabel = dashboardText[lang].downtime.noDataTooltip

  // The cells are bucketed per Monday-start week; reconstruct each cell's actual
  // local date (weekStart is a Monday, weekday is 0=Sun…6=Sat) so we can pull a
  // rolling window of any 7 consecutive calendar days regardless of week edges.
  const byDate = useMemo(() => {
    const map = new Map<string, number[]>()
    for (const cell of weekdayHourByWeek ?? []) {
      const [y, m, d] = cell.weekStart.split('-').map(Number)
      const monday = new Date(y, m - 1, d)
      const offset = (cell.weekday + 6) % 7 // Mon→0, Tue→1, … Sun→6
      const iso = isoDate(addDays(monday, offset))
      let hours = map.get(iso)
      if (!hours) {
        hours = Array(24).fill(0)
        map.set(iso, hours)
      }
      hours[cell.hour] += cell.count
    }
    return map
  }, [weekdayHourByWeek])

  const todayIso = isoDate(new Date())

  // Rolling 7-day windows ending today, then stepping back a week at a time, as
  // far back as there's data. The first window is the live "last 7 days".
  const windows = useMemo(() => {
    const today = parseIso(todayIso)
    let earliest = today
    for (const iso of byDate.keys()) {
      const d = parseIso(iso)
      if (d < earliest) earliest = d
    }
    const spanDays = Math.round((today.getTime() - earliest.getTime()) / 86_400_000)
    const count = Math.max(1, Math.ceil((spanDays + 1) / DAYS))
    return Array.from({ length: count }, (_, w) => {
      const end = addDays(today, -DAYS * w)
      const start = addDays(end, -(DAYS - 1))
      return { endIso: isoDate(end), startIso: isoDate(start) }
    })
  }, [byDate, todayIso])

  const [selected, setSelected] = useState<string>('')
  // Default to (and fall back to) the most recent window as data loads/changes.
  const activeWindow = windows.find((w) => w.endIso === selected) ?? windows[0]

  // Build the active window's 7 days, oldest first (top) → last day (bottom).
  const endDate = activeWindow ? parseIso(activeWindow.endIso) : parseIso(todayIso)
  const rows = Array.from({ length: DAYS }, (_, i) => {
    const date = addDays(endDate, -(DAYS - 1 - i))
    const iso = isoDate(date)
    return {
      iso,
      shortLabel: DAY_SHORT[lang][(date.getDay() + 6) % 7],
      dayLabel: `${DAY_FULL[lang][date.getDay()]}, ${formatDateLong(iso, lang)}`,
      counts: byDate.get(iso) ?? (Array(24).fill(0) as number[]),
    }
  })

  let max = 1
  for (const row of rows) for (const count of row.counts) if (count > max) max = count

  return (
    <Card.Root>
      <Card.Body>
        <Flex justify="space-between" align="center" mb={2} gap={3} wrap="wrap">
          <HStack gap={1} align="center">
            <Text fontSize="sm" color="fg.muted" fontWeight="medium">
              {c.heatmap}
            </Text>
            <InfoTip text={c.heatmapInfo} />
          </HStack>
          {windows.length > 1 && (
            <NativeSelect.Root size="xs" width="auto">
              <NativeSelect.Field
                aria-label={c.selectWeek}
                value={activeWindow?.endIso ?? ''}
                onChange={(e) => setSelected(e.currentTarget.value)}
              >
                {windows.map((w) => (
                  <option key={w.endIso} value={w.endIso}>
                    {w.endIso === todayIso
                      ? c.lastSevenDays
                      : formatDateRange(w.startIso, w.endIso, lang)}
                  </option>
                ))}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          )}
        </Flex>

        {/* The grid is capped at its natural size (AXIS_W + 24 cells × 28px +
            23 gaps × 3px) so cells stay square and the column gaps stay equal to
            the row gaps on wide screens instead of stretching past the cap. */}
        <Box maxW={`${AXIS_W + 24 * 28 + 23 * GAP}px`}>
          {/* hour axis */}
          <Flex mb={`${GAP}px`}>
            <Box w={`${AXIS_W}px`} flexShrink={0} />
            <Flex flex="1" gap={`${GAP}px`}>
              {Array.from({ length: 24 }, (_, h) => (
                <Box key={h} flex="1" fontSize="9px" color="fg.muted" textAlign="center">
                  {h % 3 === 0 ? h : ''}
                </Box>
              ))}
            </Flex>
          </Flex>

          {rows.map((row) => (
            <Flex key={row.iso} mb={`${GAP}px`} align="center">
              <Box w={`${AXIS_W}px`} flexShrink={0} fontSize="11px" color="fg.muted">
                {row.shortLabel}
              </Box>
              <Flex flex="1" gap={`${GAP}px`}>
                {row.counts.map((count, h) => {
                  const cellStart = Math.floor(parseIso(row.iso).getTime() / 1000) + h * 3600
                  return (
                    <HeatCell
                      key={h}
                      dayLabel={row.dayLabel}
                      hour={h}
                      count={count}
                      max={max}
                      lang={lang}
                      downtime={downtimeAt(downtime, cellStart, cellStart + 3600)}
                      noDataLabel={noDataLabel}
                    />
                  )
                })}
              </Flex>
            </Flex>
          ))}
        </Box>
      </Card.Body>
    </Card.Root>
  )
}
