import { Box, Button, Card, HStack, Input, Text } from '@chakra-ui/react'
import { useLanguage, dashboardText } from '../i18n'

// Public date/time range filter for the detections list. Collapsible, toggled by
// the "Filter" button in the Events toolbar. From/To use native datetime-local
// inputs converted to unix seconds in browser-local time (matches the server's
// Amsterdam localtime bucketing — same convention as DowntimePanel). The
// "unreviewed only" chip is admin-only (gated by `adminEnabled`).

export type FilterCriteria = { from: string; to: string; unreviewedOnly: boolean }

// Date → "YYYY-MM-DDTHH:mm" for a datetime-local input value, in local time.
function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

type Props = {
  open: boolean
  criteria: FilterCriteria
  onChange: (c: FilterCriteria) => void
  adminEnabled: boolean
  matched: number
  total: number
}

export function EventFilter({ open, criteria, onChange, adminEnabled, matched, total }: Props) {
  const { lang } = useLanguage()
  const f = dashboardText[lang].events.filter
  if (!open) return null

  const set = (patch: Partial<FilterCriteria>) => onChange({ ...criteria, ...patch })
  const rangeTo = (from: Date) => set({ from: toLocalInput(from), to: toLocalInput(new Date()) })
  const daysAgo = (n: number) => new Date(Date.now() - n * 86400 * 1000)
  const todayStart = () => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }

  return (
    <Card.Root mb={3}>
      <Card.Body py={3} px={3}>
        <Box>
          <HStack gap={3} wrap="wrap" align="end">
            <Box>
              <Text fontSize="xs" color="fg.muted" mb={1}>
                {f.from}
              </Text>
              <Input
                type="datetime-local"
                size="sm"
                value={criteria.from}
                onChange={(e) => set({ from: e.currentTarget.value })}
                width="auto"
              />
            </Box>
            <Box>
              <Text fontSize="xs" color="fg.muted" mb={1}>
                {f.to}
              </Text>
              <Input
                type="datetime-local"
                size="sm"
                value={criteria.to}
                onChange={(e) => set({ to: e.currentTarget.value })}
                width="auto"
              />
            </Box>
            <HStack gap={2} wrap="wrap">
              <Button size="xs" variant="outline" onClick={() => rangeTo(todayStart())}>
                {f.today}
              </Button>
              <Button size="xs" variant="outline" onClick={() => rangeTo(daysAgo(7))}>
                {f.last7}
              </Button>
              <Button size="xs" variant="outline" onClick={() => rangeTo(daysAgo(30))}>
                {f.last30}
              </Button>
              {adminEnabled && (
                <Button
                  size="xs"
                  variant={criteria.unreviewedOnly ? 'solid' : 'outline'}
                  colorPalette={criteria.unreviewedOnly ? 'brand' : undefined}
                  onClick={() => set({ unreviewedOnly: !criteria.unreviewedOnly })}
                >
                  {f.unreviewedOnly}
                </Button>
              )}
              <Button
                size="xs"
                variant="ghost"
                onClick={() => onChange({ from: '', to: '', unreviewedOnly: false })}
              >
                {f.clear}
              </Button>
            </HStack>
          </HStack>
          <Text fontSize="xs" color="fg.subtle" mt={2}>
            {f.count(matched, total)}
          </Text>
        </Box>
      </Card.Body>
    </Card.Root>
  )
}
