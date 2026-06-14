import { useEffect, useRef, useState } from 'react'
import { Badge, Box, Button, Card, HStack, Input, Stack, Text } from '@chakra-ui/react'

type Phase = 'idle' | 'recording' | 'done'

const PRESET_LABELS = ['siren', 'traffic', 'quiet', 'noise', 'cat']

export function RecordPanel({ connected }: { connected: boolean }) {
  const [label, setLabel] = useState('siren')
  const [custom, setCustom] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [seconds, setSeconds] = useState(0)
  const [maxSeconds, setMaxSeconds] = useState(5) // overwritten by the device's REC_MAX_SECONDS on first poll
  const [startedAt, setStartedAt] = useState(0)
  const pollRef = useRef<number | undefined>(undefined)

  const effectiveLabel = (custom.trim() || label).replace(/[^a-zA-Z0-9_-]/g, '_')
  // Mirror the firmware's download filename: <label>.<unix timestamp>.wav.
  const fileName = startedAt ? `${effectiveLabel}.${startedAt}.wav` : `${effectiveLabel}.wav`

  const stopPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = undefined
  }
  useEffect(() => () => stopPolling(), [])

  const start = async () => {
    try {
      await fetch(`/api/record/start?label=${encodeURIComponent(effectiveLabel)}`, { method: 'POST' })
      setPhase('recording')
      setSeconds(0)
      setStartedAt(0)
      pollRef.current = window.setInterval(async () => {
        try {
          const s = await fetch('/api/record/status').then((r) => r.json())
          setSeconds(s.seconds)
          setMaxSeconds(s.maxSeconds)
          if (s.startedAt) setStartedAt(s.startedAt)
          if (!s.recording) {
            stopPolling()
            setPhase('done')
          }
        } catch {
          /* ignore poll errors */
        }
      }, 500)
    } catch {
      /* offline */
    }
  }

  const stop = async () => {
    // Just request the stop; the device finalizes the file on its audio task.
    // Keep polling — the running status poll flips to 'done' once recording=false.
    try {
      await fetch('/api/record/stop', { method: 'POST' })
    } catch {
      /* ignore */
    }
  }

  if (!connected) {
    return (
      <Card.Root maxW="xl">
        <Card.Body>
          <Text fontSize="sm" color="fg.muted" fontWeight="medium" mb={2}>
            Record training audio
          </Text>
          <Text color="fg.subtle">
            Connect to the device (open this page at <b>siren-detector.local</b>) to record audio
            through the microphone. This isn't available in the offline demo.
          </Text>
        </Card.Body>
      </Card.Root>
    )
  }

  const pct = Math.min(100, (seconds / maxSeconds) * 100)

  return (
    <Card.Root maxW="xl">
      <Card.Body>
        <HStack justify="space-between" mb={1}>
          <Text fontSize="sm" color="fg.muted" fontWeight="medium">
            Record training audio
          </Text>
          {phase === 'recording' && (
            <Badge colorPalette="red" variant="solid">
              ● REC {seconds}s / {maxSeconds}s
            </Badge>
          )}
        </HStack>

        <Stack gap={5} mt={2}>
          <Box>
            <Text fontSize="xs" color="fg.subtle" mb={2}>
              Label
            </Text>
            <HStack gap={2} wrap="wrap">
              {PRESET_LABELS.map((l) => (
                <Button
                  key={l}
                  size="sm"
                  variant={!custom.trim() && label === l ? 'solid' : 'outline'}
                  colorPalette="brand"
                  disabled={phase === 'recording'}
                  onClick={() => {
                    setLabel(l)
                    setCustom('')
                  }}
                >
                  {l}
                </Button>
              ))}
              <Input
                size="sm"
                maxW="40"
                placeholder="custom…"
                value={custom}
                disabled={phase === 'recording'}
                onChange={(e) => setCustom(e.target.value)}
              />
            </HStack>
          </Box>

          {phase === 'recording' && (
            <Box w="full" h="2.5" bg="bg.muted" rounded="full" overflow="hidden">
              <Box h="full" bg="red.500" w={`${pct}%`} transition="width 0.3s linear" />
            </Box>
          )}

          <HStack gap={3}>
            {phase !== 'recording' ? (
              <Button colorPalette="red" onClick={start}>
                ● Record “{effectiveLabel}”
              </Button>
            ) : (
              <Button colorPalette="gray" onClick={stop}>
                ■ Stop
              </Button>
            )}

            {phase === 'done' && (
              <Button asChild colorPalette="brand" variant="outline">
                <a href="/api/record/download" download>
                  Download {fileName} ({seconds}s)
                </a>
              </Button>
            )}
          </HStack>

          {phase === 'done' && (
            <Text fontSize="xs" color="orange.500">
              Download this clip before recording again — the device stores only one at a time.
            </Text>
          )}

          <Text fontSize="xs" color="fg.subtle" lineHeight="1.6">
            Records mono 16&nbsp;kHz WAV, auto-stops at {maxSeconds}s. Collect several samples per
            label (<b>siren</b>, <b>traffic</b>, <b>quiet</b>, <b>noise</b>, <b>cat</b>) at the
            window, then upload the WAVs to Edge Impulse Studio → Data acquisition to train the
            model (M3).
          </Text>
        </Stack>
      </Card.Body>
    </Card.Root>
  )
}
