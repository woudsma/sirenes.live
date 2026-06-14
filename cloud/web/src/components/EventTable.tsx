import { useEffect, useRef, useState } from 'react'
import { Badge, Box, Button, Card, HStack, IconButton, Table, Text } from '@chakra-ui/react'
import { LuAudioLines, LuDownload, LuLock, LuPause, LuPlay, LuTrash2 } from 'react-icons/lu'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { SirenEvent } from '../types'
import { useLanguage, dashboardText, type Lang } from '../i18n'

// Fixed row height (px) so the whole history can be virtualized without measuring
// each row — every row is single-line, so a fixed height never clips.
const ROW_H = 45

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

function PlayButton({
  src,
  onPlay,
  playLabel,
  stopLabel,
}: {
  src: string
  onPlay?: () => void
  playLabel: string
  stopLabel: string
}) {
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
      aria-label={playing ? stopLabel : playLabel}
      size="xs"
      h="5"
      minW="5"
      variant="ghost"
      colorPalette="purple"
      onClick={toggle}
    >
      {playing ? <LuPause /> : <LuPlay />}
    </IconButton>
  )
}

function fmtTime(ts: number, lang: string): string {
  return new Date(ts * 1000).toLocaleString(lang === 'nl' ? 'nl-NL' : [], {
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
  adminToken?: string
  onDelete?: (ts: number) => void
  onClear?: () => void
  onReview?: (ts: number) => void
}

// Clips are private until an admin reviews them: reviewed clips are served
// publicly, unreviewed ones only with the admin token (sent as a ?token= query
// param since <audio>/download links can't set headers).
function clipSrc(clip: string, reviewed: boolean, adminToken?: string): string {
  if (reviewed) return clip
  return `${clip}?token=${encodeURIComponent(adminToken ?? '')}`
}

type EventsText = (typeof dashboardText)['en']['events']

function EventRow({
  e,
  lang,
  ev,
  showActions,
  adminToken,
  onDelete,
  onReview,
}: {
  e: SirenEvent
  lang: Lang
  ev: EventsText
  showActions: boolean
  adminToken?: string
  onDelete?: (ts: number) => void
  onReview?: (ts: number) => void
}) {
  const needsReview = showActions && !e.reviewed
  return (
    <Table.Row
      h={`${ROW_H}px`}
      colorPalette="orange"
      bg={needsReview ? 'colorPalette.subtle' : undefined}
    >
      <Table.Cell>{fmtTime(e.ts, lang)}</Table.Cell>
      <Table.Cell textAlign="end">
        <Badge colorPalette={dbColor(e.peakDb)} variant="subtle">
          {e.peakDb.toFixed(1)}
        </Badge>
      </Table.Cell>
      <Table.Cell textAlign="end">{e.durationS}s</Table.Cell>
      <Table.Cell textAlign="end">{Math.round(e.confidence * 100)}%</Table.Cell>
      <Table.Cell textAlign="center">
        {e.clip ? (
          // Public visitors can only play a clip once it's been reviewed; the
          // admin (token present) can play any clip.
          e.reviewed || adminToken ? (
            (() => {
              const src = clipSrc(e.clip, e.reviewed, adminToken)
              return (
                <HStack gap={0} justify="center">
                  <PlayButton
                    src={src}
                    onPlay={onReview ? () => onReview(e.ts) : undefined}
                    playLabel={ev.playClip}
                    stopLabel={ev.stopClip}
                  />
                  <IconButton
                    asChild
                    aria-label={ev.downloadClip}
                    size="xs"
                    h="5"
                    minW="5"
                    variant="ghost"
                    colorPalette="purple"
                  >
                    <a href={src} download={clipFileName(e.ts)}>
                      <LuDownload />
                    </a>
                  </IconButton>
                  {showActions && (
                    <IconButton
                      asChild
                      aria-label={ev.downloadAsNoise}
                      size="xs"
                      h="5"
                      minW="5"
                      variant="ghost"
                      colorPalette="gray"
                    >
                      <a href={src} download={noiseFileName(e.ts)}>
                        <LuAudioLines />
                      </a>
                    </IconButton>
                  )}
                </HStack>
              )
            })()
          ) : (
            <HStack
              gap={1}
              justify="center"
              color="fg.subtle"
              aria-label={ev.clipPendingReview}
              title={ev.clipPrivate}
            >
              <LuLock />
            </HStack>
          )
        ) : (
          <Text color="fg.subtle" aria-label={ev.noClip}>
            —
          </Text>
        )}
      </Table.Cell>
      {showActions && (
        <Table.Cell textAlign="center">
          <IconButton
            aria-label={ev.deleteEvent}
            size="xs"
            h="5"
            minW="5"
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
}

export function EventTable({
  events,
  unreviewed = 0,
  adminToken,
  onDelete,
  onClear,
  onReview,
}: Props) {
  const { lang } = useLanguage()
  const ev = dashboardText[lang].events
  const showActions = !!onDelete
  const cols = showActions ? 6 : 5

  // Virtualize the row list so the whole history (potentially thousands of rows)
  // renders only what's visible. Real <tr> spacer rows above/below the window
  // keep the single <table>'s column widths in sync with the sticky header.
  const scrollRef = useRef<HTMLDivElement>(null)
  const rowVirtualizer = useVirtualizer({
    count: events.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: 12,
  })
  const virtualRows = rowVirtualizer.getVirtualItems()
  const paddingTop = virtualRows.length ? virtualRows[0].start : 0
  const paddingBottom = virtualRows.length
    ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
    : 0

  return (
    <Card.Root>
      <Card.Body py={3} px={0}>
        <HStack justify="space-between" mb={3} px={3}>
          <Text fontSize="sm" color="fg.muted" fontWeight="medium">
            {ev.detections}
          </Text>
          <HStack gap={3}>
            {showActions && unreviewed > 0 && (
              <Badge colorPalette="orange" variant="subtle">
                {unreviewed} {ev.toReview}
              </Badge>
            )}
            <Text fontSize="xs" color="fg.subtle">
              {events.length} {ev.shown}
            </Text>
            {onClear && events.length > 0 && (
              <Button
                size="xs"
                variant="outline"
                colorPalette="red"
                onClick={() => {
                  if (window.confirm(ev.clearConfirm)) onClear()
                }}
              >
                <LuTrash2 /> {ev.clearAll}
              </Button>
            )}
          </HStack>
        </HStack>
        <Box ref={scrollRef} overflowY="auto" maxH="2xl">
          <Table.Root size="sm" stickyHeader interactive>
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader>{ev.colTime}</Table.ColumnHeader>
                <Table.ColumnHeader textAlign="end">{ev.colPeakDb}</Table.ColumnHeader>
                <Table.ColumnHeader textAlign="end">{ev.colDuration}</Table.ColumnHeader>
                <Table.ColumnHeader textAlign="end">{ev.colConfidence}</Table.ColumnHeader>
                <Table.ColumnHeader textAlign="center">{ev.colClip}</Table.ColumnHeader>
                {showActions && <Table.ColumnHeader textAlign="center" />}
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {events.length === 0 ? (
                <Table.Row>
                  <Table.Cell colSpan={cols}>
                    <Text color="fg.subtle" textAlign="center" py={4}>
                      {ev.noDetections}
                    </Text>
                  </Table.Cell>
                </Table.Row>
              ) : (
                <>
                  {paddingTop > 0 && (
                    <Table.Row aria-hidden>
                      <Table.Cell colSpan={cols} p={0} border="none" h={`${paddingTop}px`} />
                    </Table.Row>
                  )}
                  {virtualRows.map((vr) => {
                    const e = events[vr.index]
                    return (
                      <EventRow
                        key={e.ts}
                        e={e}
                        lang={lang}
                        ev={ev}
                        showActions={showActions}
                        adminToken={adminToken}
                        onDelete={onDelete}
                        onReview={onReview}
                      />
                    )
                  })}
                  {paddingBottom > 0 && (
                    <Table.Row aria-hidden>
                      <Table.Cell colSpan={cols} p={0} border="none" h={`${paddingBottom}px`} />
                    </Table.Row>
                  )}
                </>
              )}
            </Table.Body>
          </Table.Root>
        </Box>
      </Card.Body>
    </Card.Root>
  )
}
