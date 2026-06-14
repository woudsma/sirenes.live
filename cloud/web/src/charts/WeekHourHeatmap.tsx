import { useMemo, useState } from 'react'
import { Box, Card, Flex, HStack, NativeSelect, Portal, Text, Tooltip } from '@chakra-ui/react'
import type { WeekHourWeekCell } from '../types'
import { heatColor } from '../lib/heatmap'
import { formatDateLong } from '../lib/format'
import { InfoTip } from '../components/InfoTip'
import { useLanguage, dashboardText, sirens, DAY_SHORT, DAY_FULL } from '../i18n'

// Weekday × hour punchcard: 7 rows (Mon→Sun) × 24 columns (hours), darker = more
// sirens. Reveals the temporal signature (e.g. weekday rush-hour clusters) that
// the 1-D time-of-day chart flattens away. Cells flex to fill the card width
// (kept square, with a max so they don't grow too large). Each has a hover
// tooltip with the day + time, portaled so nothing clips it. A dropdown picks
// which Monday-start week to view; the most recent week is shown by default.

const GAP = 3 // px
// Display Mon..Sun; map to the API's weekday index (0=Sun … 6=Sat).
const ROW_WD = [1, 2, 3, 4, 5, 6, 0]
const AXIS_W = 32 // px, left label column

function HeatCell({
  weekday,
  hour,
  count,
  max,
  lang,
}: {
  weekday: number
  hour: number
  count: number
  max: number
  lang: 'en' | 'nl'
}) {
  const label = `${DAY_FULL[lang][weekday]} ${String(hour).padStart(2, '0')}:00 — ${sirens(
    count,
    lang,
  )}`
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
          bg={heatColor(count, max)}
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
}: {
  weekdayHourByWeek?: WeekHourWeekCell[]
}) {
  const { lang } = useLanguage()
  const c = dashboardText[lang].charts
  // Group the cells by their Monday-start week, newest week first for the dropdown.
  const weeks = useMemo(() => {
    const byWeek = new Map<string, WeekHourWeekCell[]>()
    for (const c of weekdayHourByWeek ?? []) {
      const list = byWeek.get(c.weekStart)
      if (list) list.push(c)
      else byWeek.set(c.weekStart, [c])
    }
    return [...byWeek.keys()]
      .sort((a, b) => b.localeCompare(a))
      .map((weekStart) => ({
        weekStart,
        cells: byWeek.get(weekStart)!,
      }))
  }, [weekdayHourByWeek])

  const [selected, setSelected] = useState<string>('')
  // Default to (and fall back to) the most recent week as data loads/changes.
  const activeWeek = weeks.find((w) => w.weekStart === selected) ?? weeks[0]

  // matrix[weekday][hour] = count for the selected week
  const matrix: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0))
  let max = 1
  for (const c of activeWeek?.cells ?? []) {
    matrix[c.weekday][c.hour] = c.count
    if (c.count > max) max = c.count
  }

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
          {weeks.length > 0 && (
            <NativeSelect.Root size="xs" width="auto">
              <NativeSelect.Field
                aria-label={c.selectWeek}
                value={activeWeek?.weekStart ?? ''}
                onChange={(e) => setSelected(e.currentTarget.value)}
              >
                {weeks.map((w) => (
                  <option key={w.weekStart} value={w.weekStart}>
                    {c.weekOf} {formatDateLong(w.weekStart, lang)}
                  </option>
                ))}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          )}
        </Flex>

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

        {ROW_WD.map((wd, i) => (
          <Flex key={wd} mb={`${GAP}px`} align="center">
            <Box w={`${AXIS_W}px`} flexShrink={0} fontSize="11px" color="fg.muted">
              {DAY_SHORT[lang][i]}
            </Box>
            <Flex flex="1" gap={`${GAP}px`}>
              {matrix[wd].map((count, h) => (
                <HeatCell key={h} weekday={wd} hour={h} count={count} max={max} lang={lang} />
              ))}
            </Flex>
          </Flex>
        ))}
      </Card.Body>
    </Card.Root>
  )
}
