import { useEffect, useState } from 'react'
import { HStack, Text } from '@chakra-ui/react'
import { useLanguage, dashboardText } from '../i18n'

// Live "time since last siren" ticker shown next to the Dashboard/Events tabs.
// Counts up every second from the most recent event's timestamp; because the
// timestamp is the max event ts, a newly ingested event (picked up by the 20s
// poll in useCloud) naturally resets the elapsed time downward.

// Always shows seconds so the value is visibly ticking: "03:14:09", or
// "2d 03:14:09" once it crosses a day.
function formatElapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const days = Math.floor(s / 86400)
  const hh = String(Math.floor((s % 86400) / 3600)).padStart(2, '0')
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${days > 0 ? `${days}d ` : ''}${hh}:${mm}:${ss}`
}

export function LastSirenTimer({ latestTs }: { latestTs: number | null }) {
  const [now, setNow] = useState(() => Date.now())
  const { lang } = useLanguage()
  const label = dashboardText[lang].timeSinceLast

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const elapsed = latestTs != null ? formatElapsed(now / 1000 - latestTs) : '—'

  return (
    <HStack gap={2} color="fg.muted" title={label}>
      <Text fontSize="md" ml={1}>
        {label}
      </Text>
      <Text
        fontSize="md"
        fontWeight="semibold"
        color="fg"
        fontVariantNumeric="tabular-nums"
        minW="6.5em"
      >
        {elapsed}
      </Text>
    </HStack>
  )
}
