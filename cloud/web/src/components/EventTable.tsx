import { useEffect, useRef, useState } from 'react'
import { Badge, Button, Card, HStack, IconButton, Table, Text } from '@chakra-ui/react'
import { LuAudioLines, LuDownload, LuPause, LuPlay, LuTrash2 } from 'react-icons/lu'
import type { SirenEvent } from '../types'

// Download name in the same "<label>.<unix timestamp>.wav" form as the training
// recordings, e.g. "siren.1780516885.wav" (the server stores clips as "<epoch>.wav";
// the `download` attribute renames the saved file). `ts` is unix seconds.
function clipFileName(ts: number): string {
  return `siren.${ts}.wav`
}

// Same clip, but saved as a "noise.<ts>.wav" so it can be filed under the noise
// label (e.g. for retraining the model against false positives).
function noiseFileName(ts: number): string {
  return `noise.${ts}.wav`
}

function PlayButton({ src, onPlay }: { src: string; onPlay?: () => void }) {
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    return () => {
      audioRef.current?.pause()
      audioRef.current = null
    }
  }, [])

  const toggle = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(src)
      audioRef.current.onended = () => setPlaying(false)
    }
    if (playing) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      setPlaying(false)
    } else {
      void audioRef.current.play()
      setPlaying(true)
      onPlay?.() // listening counts as reviewing
    }
  }

  return (
    <IconButton
      aria-label={playing ? 'Stop clip' : 'Play clip'}
      size="xs"
      variant="ghost"
      colorPalette="purple"
      onClick={toggle}
    >
      {playing ? <LuPause /> : <LuPlay />}
    </IconButton>
  )
}

function fmtTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function dbColor(db: number): string {
  if (db < 80) return 'green'
  if (db < 90) return 'yellow'
  if (db < 100) return 'orange'
  return 'red'
}

interface Props {
  events: SirenEvent[]
  unreviewed?: number
  onDelete?: (ts: number) => void
  onClear?: () => void
  onReview?: (ts: number) => void
}

export function EventTable({ events, unreviewed = 0, onDelete, onClear, onReview }: Props) {
  const showActions = !!onDelete
  return (
    <Card.Root>
      <Card.Body>
        <HStack justify="space-between" mb={3}>
          <Text fontSize="sm" color="fg.muted" fontWeight="medium">
            Detections
          </Text>
          <HStack gap={3}>
            {showActions && unreviewed > 0 && (
              <Badge colorPalette="orange" variant="subtle">
                {unreviewed} to review
              </Badge>
            )}
            <Text fontSize="xs" color="fg.subtle">
              {events.length} shown
            </Text>
            {onClear && events.length > 0 && (
              <Button
                size="xs"
                variant="outline"
                colorPalette="red"
                onClick={() => {
                  if (window.confirm('Delete all events and their clips? This cannot be undone.'))
                    onClear()
                }}
              >
                <LuTrash2 /> Clear all
              </Button>
            )}
          </HStack>
        </HStack>
        <Table.ScrollArea maxH="2xl">
          <Table.Root size="sm" stickyHeader interactive>
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader>Time</Table.ColumnHeader>
                <Table.ColumnHeader textAlign="end">Peak dB</Table.ColumnHeader>
                <Table.ColumnHeader textAlign="end">Duration</Table.ColumnHeader>
                <Table.ColumnHeader textAlign="end">Confidence</Table.ColumnHeader>
                <Table.ColumnHeader textAlign="center">Clip</Table.ColumnHeader>
                {showActions && <Table.ColumnHeader textAlign="center" />}
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {events.map((e) => {
                const needsReview = showActions && !e.reviewed
                return (
                <Table.Row key={e.ts} colorPalette="orange" bg={needsReview ? 'colorPalette.subtle' : undefined}>
                  <Table.Cell>{fmtTime(e.ts)}</Table.Cell>
                  <Table.Cell textAlign="end">
                    <Badge colorPalette={dbColor(e.peakDb)} variant="subtle">
                      {e.peakDb.toFixed(1)}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell textAlign="end">{e.durationS}s</Table.Cell>
                  <Table.Cell textAlign="end">{Math.round(e.confidence * 100)}%</Table.Cell>
                  <Table.Cell textAlign="center">
                    {e.clip ? (
                      <HStack gap={0} justify="center">
                        <PlayButton src={e.clip} onPlay={onReview ? () => onReview(e.ts) : undefined} />
                        <IconButton
                          asChild
                          aria-label="Download clip"
                          size="xs"
                          variant="ghost"
                          colorPalette="purple"
                        >
                          <a href={e.clip} download={clipFileName(e.ts)}>
                            <LuDownload />
                          </a>
                        </IconButton>
                        {showActions && (
                          <IconButton
                            asChild
                            aria-label="Download as noise"
                            size="xs"
                            variant="ghost"
                            colorPalette="gray"
                          >
                            <a href={e.clip} download={noiseFileName(e.ts)}>
                              <LuAudioLines />
                            </a>
                          </IconButton>
                        )}
                      </HStack>
                    ) : (
                      <Text color="fg.subtle" aria-label="no clip">
                        —
                      </Text>
                    )}
                  </Table.Cell>
                  {showActions && (
                    <Table.Cell textAlign="center">
                      <IconButton
                        aria-label="Delete event"
                        size="xs"
                        variant="ghost"
                        colorPalette="red"
                        onClick={() => onDelete?.(e.ts)}
                      >
                        <LuTrash2 />
                      </IconButton>
                    </Table.Cell>
                  )}
                </Table.Row>
                )
              })}
              {events.length === 0 && (
                <Table.Row>
                  <Table.Cell colSpan={showActions ? 6 : 5}>
                    <Text color="fg.subtle" textAlign="center" py={4}>
                      No detections yet.
                    </Text>
                  </Table.Cell>
                </Table.Row>
              )}
            </Table.Body>
          </Table.Root>
        </Table.ScrollArea>
      </Card.Body>
    </Card.Root>
  )
}
