import { Badge, Button, Card, HStack, IconButton, Table, Text } from '@chakra-ui/react'
import { LuTrash2 } from 'react-icons/lu'
import type { SirenEvent } from '../types'

// Clips are not played from the on-device UI — they're streamed to the cloud
// archive and listened to there.

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
  onDelete?: (ts: number) => void
  onClear?: () => void
}

export function EventTable({ events, onDelete, onClear }: Props) {
  const showActions = !!onDelete
  return (
    <Card.Root>
      <Card.Body>
        <HStack justify="space-between" mb={3}>
          <Text fontSize="sm" color="fg.muted" fontWeight="medium">
            Recent detections
          </Text>
          <HStack gap={3}>
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
        <Table.ScrollArea maxH="lg">
          <Table.Root size="sm" stickyHeader interactive>
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader>Time</Table.ColumnHeader>
                <Table.ColumnHeader textAlign="end">Peak dB</Table.ColumnHeader>
                <Table.ColumnHeader textAlign="end">Duration</Table.ColumnHeader>
                <Table.ColumnHeader textAlign="end">Confidence</Table.ColumnHeader>
                {showActions && <Table.ColumnHeader textAlign="center" />}
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {events.map((e) => (
                <Table.Row key={e.ts}>
                  <Table.Cell>{fmtTime(e.ts)}</Table.Cell>
                  <Table.Cell textAlign="end">
                    <Badge colorPalette={dbColor(e.peakDb)} variant="subtle">
                      {e.peakDb.toFixed(1)}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell textAlign="end">{e.durationS}s</Table.Cell>
                  <Table.Cell textAlign="end">{Math.round(e.confidence * 100)}%</Table.Cell>
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
              ))}
              {events.length === 0 && (
                <Table.Row>
                  <Table.Cell colSpan={showActions ? 5 : 4}>
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
