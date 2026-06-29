import { useEffect, useRef } from 'react'
import { Box, Card, Flex, HStack, Portal, Text, Tooltip } from '@chakra-ui/react'
import type { CalendarDay, Downtime } from '../types'
import { HEAT_EMPTY, HEAT_LEVELS, HEAT_DOWNTIME, heatColor } from '../lib/heatmap'
import { multiDayDowntimeOn } from '../lib/downtime'
import { isoDate, addDays } from '../lib/date'
import { InfoTip } from '../components/InfoTip'
import { useLanguage, dashboardText, sirens, MONTHS_SHORT } from '../i18n'

// GitHub-style contributions calendar for the last ~year of detections: weeks as
// columns (Mon→Sun rows), one cell per day, darker = more sirens. Cells flex to
// fill the card width (kept square with a max) so it stays full-width but short.
// Each cell has a portaled hover tooltip with the date + count. Reuses the shared
// brand heat scale so it matches the weekday×hour punchcard.

const GAP = 3 // px
const WEEKS = 53
const AXIS_W = 28 // px, left weekday-label column

interface Cell {
  date: string
  count: number
  peakDb: number
  inRange: boolean // false for days past today — rendered invisible to keep the grid square
  downtime?: Downtime // set when a >24h outage fully covers this day
}

export function ContributionsCalendar({
  calendar,
  downtime = [],
}: {
  calendar: CalendarDay[]
  downtime?: Downtime[]
}) {
  const { lang } = useLanguage()
  const c = dashboardText[lang].charts
  const noDataLabel = dashboardText[lang].downtime.noDataTooltip
  const months = MONTHS_SHORT[lang]
  // Mon..Sun labels with only alternating rows shown (Mon, Wed, Fri).
  const rowLabels =
    lang === 'nl' ? ['ma', '', 'wo', '', 'vr', '', ''] : ['Mon', '', 'Wed', '', 'Fri', '', '']
  // On narrow screens the grid overflows horizontally; start scrolled all the way
  // to the right so the most recent days are visible without manual scrolling.
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [])

  const byDate = new Map(calendar.map((d) => [d.date, d]))
  let max = 1
  for (const d of calendar) if (d.count > max) max = d.count

  // Anchor on today; walk back to the Monday WEEKS-1 weeks before this week's Monday.
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayIso = isoDate(today)
  const mondayOffset = (today.getDay() + 6) % 7 // 0=Sun→6, 1=Mon→0, …
  const thisMonday = addDays(today, -mondayOffset)
  const firstMonday = addDays(thisMonday, -(WEEKS - 1) * 7)

  // columns[week][weekday 0=Mon..6=Sun]
  const columns: Cell[][] = []
  const monthLabels: (string | null)[] = []
  let prevMonth = -1
  for (let w = 0; w < WEEKS; w++) {
    const col: Cell[] = []
    const colStart = addDays(firstMonday, w * 7)
    // Month label when this column's Monday opens a new month.
    const m = colStart.getMonth()
    monthLabels.push(m !== prevMonth ? months[m] : null)
    prevMonth = m
    for (let r = 0; r < 7; r++) {
      const d = addDays(colStart, r)
      const iso = isoDate(d)
      const hit = byDate.get(iso)
      col.push({
        date: iso,
        count: hit?.count ?? 0,
        peakDb: hit?.peakDb ?? 0,
        inRange: iso <= todayIso,
        downtime: multiDayDowntimeOn(downtime, iso),
      })
    }
    columns.push(col)
  }

  return (
    <Card.Root>
      <Card.Body>
        <Flex justify="space-between" align="baseline" mb={2} gap={3} wrap="wrap">
          <HStack gap={1} align="center">
            <Text fontSize="sm" color="fg.muted" fontWeight="medium">
              {c.calendar}
            </Text>
            <InfoTip text={c.calendarInfo} />
          </HStack>
          <Flex align="center" gap={1} fontSize="10px" color="fg.muted">
            <Text>{c.less}</Text>
            <Box w="10px" h="10px" rounded="2px" bg={HEAT_EMPTY} />
            {HEAT_LEVELS.map((color) => (
              <Box key={color} w="10px" h="10px" rounded="2px" bg={color} />
            ))}
            <Text>{c.more}</Text>
          </Flex>
        </Flex>

        {/* Scrolls horizontally on narrow screens; minW keeps cells legible
            instead of squishing 53 columns into a phone width. maxW caps the grid
            at its natural size (AXIS_W + 53 cells × 14px + 52 gaps × 3px) so the
            cells stay square and the column gaps stay equal to the row gaps on
            wide screens instead of stretching. */}
        <Box ref={scrollRef} overflowX="auto">
          <Box minW="720px" maxW={`${AXIS_W + WEEKS * 14 + (WEEKS - 1) * GAP}px`}>
            {/* month axis */}
            <Flex mb={`${GAP}px`}>
              <Box w={`${AXIS_W}px`} flexShrink={0} />
              <Flex flex="1" gap={`${GAP}px`}>
                {monthLabels.map((label, i) => (
                  <Box key={i} flex="1" fontSize="9px" color="fg.muted" whiteSpace="nowrap">
                    {label}
                  </Box>
                ))}
              </Flex>
            </Flex>

            <Flex>
              {/* weekday axis */}
              <Flex direction="column" w={`${AXIS_W}px`} flexShrink={0} gap={`${GAP}px`}>
                {rowLabels.map((label, r) => (
                  <Box
                    key={r}
                    flex="1"
                    fontSize="9px"
                    color="fg.muted"
                    lineHeight="1"
                    display="flex"
                    alignItems="center"
                  >
                    {label}
                  </Box>
                ))}
              </Flex>

              {/* week columns */}
              <Flex flex="1" gap={`${GAP}px`}>
                {columns.map((col, w) => (
                  <Flex key={w} direction="column" flex="1" gap={`${GAP}px`}>
                    {col.map((cell) => (
                      <DayCell
                        key={cell.date}
                        cell={cell}
                        max={max}
                        lang={lang}
                        peakLabel={c.peak}
                        noDataLabel={noDataLabel}
                      />
                    ))}
                  </Flex>
                ))}
              </Flex>
            </Flex>
          </Box>
        </Box>
      </Card.Body>
    </Card.Root>
  )
}

function DayCell({
  cell,
  max,
  lang,
  peakLabel,
  noDataLabel,
}: {
  cell: Cell
  max: number
  lang: 'en' | 'nl'
  peakLabel: string
  noDataLabel: string
}) {
  if (!cell.inRange) {
    return <Box flex="1" aspectRatio="1" maxW="14px" />
  }
  const label = cell.downtime
    ? `${cell.date} — ${noDataLabel}${cell.downtime.reason ? ` (${cell.downtime.reason})` : ''}`
    : `${cell.date} — ${sirens(cell.count, lang)}${
        cell.count > 0 ? `, ${peakLabel} ${Math.round(cell.peakDb)} dB` : ''
      }`
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
          maxW="14px"
          rounded="2px"
          bg={cell.downtime ? HEAT_DOWNTIME : heatColor(cell.count, max)}
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
