import { useState } from 'react'
import { HStack, SegmentGroup, Text } from '@chakra-ui/react'

// Dev-only switch (rendered only under import.meta.env.DEV) that re-seeds the
// local DB between the bundled sample CSV and a generated 3-month dataset, so the
// calendar/heatmap tiles have something to show. Hits POST /api/dev/seed, which
// the server only mounts when ALLOW_DEV_SEED=1.
export function DevSeedToggle({ onSeed }: { onSeed: (dataset: 'sample' | 'demo') => Promise<void> }) {
  const [value, setValue] = useState<'sample' | 'demo'>('sample')
  const [busy, setBusy] = useState(false)

  return (
    <HStack gap={2}>
      <Text fontSize="xs" color="fg.muted">
        Dev data
      </Text>
      <SegmentGroup.Root
        size="xs"
        value={value}
        disabled={busy}
        onValueChange={async (e) => {
          const v = (e.value as 'sample' | 'demo') || 'sample'
          setValue(v)
          setBusy(true)
          try {
            await onSeed(v)
          } finally {
            setBusy(false)
          }
        }}
      >
        <SegmentGroup.Indicator />
        <SegmentGroup.Items
          items={[
            { value: 'sample', label: 'Sample' },
            { value: 'demo', label: '3-mo demo' },
          ]}
        />
      </SegmentGroup.Root>
    </HStack>
  )
}
