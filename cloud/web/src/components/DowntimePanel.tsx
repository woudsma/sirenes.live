import { useEffect, useState } from 'react'
import { Box, Button, Card, HStack, IconButton, Input, Stack, Text } from '@chakra-ui/react'
import { LuChevronDown, LuChevronRight, LuTrash2 } from 'react-icons/lu'
import type { Downtime } from '../types'
import { useLanguage, dashboardText } from '../i18n'

// Admin-only management of downtime periods (when the device wasn't collecting
// data). Lives above the detections list on the Events tab; collapsed by default.
// The "Add downtime" button in the Events header toggles `adding` (owned by App),
// which expands the panel and reveals the form. Datetimes are entered with native
// datetime-local inputs and converted to unix seconds in browser-local time, which
// matches the server's localtime bucketing (the deployment runs in Amsterdam).

function fmtRange(d: Downtime, lang: string): string {
  const opts: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }
  const loc = lang === 'nl' ? 'nl-NL' : []
  const start = new Date(d.startEpoch * 1000).toLocaleString(loc, opts)
  const end = new Date(d.endEpoch * 1000).toLocaleString(loc, opts)
  return `${start} → ${end}`
}

// Date → "YYYY-MM-DDTHH:mm" for a datetime-local input value, in local time.
function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function AddForm({
  onSave,
  onCancel,
}: {
  onSave: (d: { startEpoch: number; endEpoch: number; reason: string }) => Promise<boolean>
  onCancel: () => void
}) {
  const { lang } = useLanguage()
  const t = dashboardText[lang].downtime
  const now = new Date()
  const [start, setStart] = useState(toLocalInput(new Date(now.getTime() - 3600 * 1000)))
  const [end, setEnd] = useState(toLocalInput(now))
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    const startEpoch = Math.floor(new Date(start).getTime() / 1000)
    const endEpoch = Math.floor(new Date(end).getTime() / 1000)
    if (!startEpoch || !endEpoch || endEpoch <= startEpoch) {
      setError(t.invalidRange)
      return
    }
    setSaving(true)
    const ok = await onSave({ startEpoch, endEpoch, reason: reason.trim() })
    setSaving(false)
    if (ok) onCancel()
    else setError(t.invalidRange)
  }

  return (
    <Box borderWidth="1px" rounded="md" p={3} mb={3}>
      <Stack gap={3}>
        <HStack gap={3} wrap="wrap" align="end">
          <Box>
            <Text fontSize="xs" color="fg.muted" mb={1}>
              {t.start}
            </Text>
            <Input
              type="datetime-local"
              size="sm"
              value={start}
              onChange={(e) => setStart(e.currentTarget.value)}
              width="auto"
            />
          </Box>
          <Box>
            <Text fontSize="xs" color="fg.muted" mb={1}>
              {t.end}
            </Text>
            <Input
              type="datetime-local"
              size="sm"
              value={end}
              onChange={(e) => setEnd(e.currentTarget.value)}
              width="auto"
            />
          </Box>
        </HStack>
        <Box>
          <Text fontSize="xs" color="fg.muted" mb={1}>
            {t.reason}
          </Text>
          <Input
            size="sm"
            value={reason}
            placeholder={t.reasonPlaceholder}
            onChange={(e) => setReason(e.currentTarget.value)}
          />
        </Box>
        {error && (
          <Text fontSize="xs" color="orange.500">
            {error}
          </Text>
        )}
        <HStack gap={2}>
          <Button size="xs" colorPalette="brand" onClick={submit} loading={saving}>
            {t.save}
          </Button>
          <Button size="xs" variant="outline" onClick={onCancel}>
            {t.cancel}
          </Button>
        </HStack>
      </Stack>
    </Box>
  )
}

export function DowntimePanel({
  downtime,
  adding,
  onAddingChange,
  onAdd,
  onDelete,
}: {
  downtime: Downtime[]
  adding: boolean
  onAddingChange: (v: boolean) => void
  onAdd: (d: { startEpoch: number; endEpoch: number; reason: string }) => Promise<boolean>
  onDelete: (id: number) => void
}) {
  const { lang } = useLanguage()
  const t = dashboardText[lang].downtime
  const [expanded, setExpanded] = useState(false)
  // Opening the add form also opens the panel so the new period is visible.
  useEffect(() => {
    if (adding) setExpanded(true)
  }, [adding])
  const showBody = expanded || adding

  return (
    <Card.Root mb={3}>
      <Card.Body py={3} px={3}>
        <HStack justify="space-between" cursor="pointer" onClick={() => setExpanded((v) => !v)}>
          <HStack gap={2}>
            <Box color="fg.muted">{showBody ? <LuChevronDown /> : <LuChevronRight />}</Box>
            <Text fontSize="sm" color="fg.muted" fontWeight="medium">
              {t.count(downtime.length)}
            </Text>
          </HStack>
        </HStack>

        {showBody && (
          <Box mt={3}>
            {adding && <AddForm onSave={onAdd} onCancel={() => onAddingChange(false)} />}
            {downtime.length === 0 ? (
              <Text fontSize="sm" color="fg.subtle" py={2}>
                {t.empty}
              </Text>
            ) : (
              <Stack gap={0}>
                {downtime.map((d) => (
                  <HStack
                    key={d.id}
                    justify="space-between"
                    py={2}
                    borderBottomWidth="1px"
                    borderColor="border.muted"
                    _last={{ borderBottomWidth: 0 }}
                  >
                    <Box>
                      <Text fontSize="sm">{fmtRange(d, lang)}</Text>
                      {d.reason && (
                        <Text fontSize="xs" color="fg.muted">
                          {d.reason}
                        </Text>
                      )}
                    </Box>
                    <IconButton
                      aria-label={t.delete}
                      size="xs"
                      h="5"
                      minW="5"
                      variant="ghost"
                      colorPalette="red"
                      onClick={() => onDelete(d.id)}
                    >
                      <LuTrash2 />
                    </IconButton>
                  </HStack>
                ))}
              </Stack>
            )}
          </Box>
        )}
      </Card.Body>
    </Card.Root>
  )
}
