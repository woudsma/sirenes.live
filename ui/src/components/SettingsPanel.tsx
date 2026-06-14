import { useEffect, useState } from 'react'
import { Button, Card, Field, Input, SimpleGrid, Stack, Text } from '@chakra-ui/react'
import type { DeviceConfig } from '../types'

interface Props {
  config: DeviceConfig
  onSave: (c: DeviceConfig) => void
  usingMock: boolean
}

export function SettingsPanel({ config, onSave, usingMock }: Props) {
  const [draft, setDraft] = useState<DeviceConfig>(config)
  const [saved, setSaved] = useState(false)

  useEffect(() => setDraft(config), [config])

  const set = (key: keyof DeviceConfig, value: number) => {
    setDraft((d) => ({ ...d, [key]: value }))
    setSaved(false)
  }

  const save = () => {
    onSave(draft)
    setSaved(true)
  }

  return (
    <Card.Root maxW="lg">
      <Card.Body>
        <Text fontSize="sm" color="fg.muted" fontWeight="medium" mb={4}>
          Detection settings
        </Text>
        <Stack gap={5}>
          <Field.Root>
            <Field.Label>dB calibration offset</Field.Label>
            <Input
              type="number"
              step="0.5"
              value={draft.cal_offset_db}
              onChange={(e) => set('cal_offset_db', parseFloat(e.target.value) || 0)}
            />
            <Field.HelperText>
              Added to every dB reading. Tune against a phone SPL-meter app (M1).
            </Field.HelperText>
          </Field.Root>

          <SimpleGrid columns={{ base: 1, sm: 2 }} gap={4}>
            <Field.Root>
              <Field.Label>Trigger score (on)</Field.Label>
              <Input
                type="number"
                step="0.05"
                min="0"
                max="1"
                value={draft.score_on}
                onChange={(e) => set('score_on', parseFloat(e.target.value) || 0)}
              />
              <Field.HelperText>Open an event above this (0–1).</Field.HelperText>
            </Field.Root>

            <Field.Root>
              <Field.Label>Release score (off)</Field.Label>
              <Input
                type="number"
                step="0.05"
                min="0"
                max="1"
                value={draft.score_off}
                onChange={(e) => set('score_off', parseFloat(e.target.value) || 0)}
              />
              <Field.HelperText>Close an event below this (0–1).</Field.HelperText>
            </Field.Root>
          </SimpleGrid>

          <Field.Root>
            <Field.Label>Minimum duration (ms)</Field.Label>
            <Input
              type="number"
              step="100"
              min="0"
              value={draft.min_ms}
              onChange={(e) => set('min_ms', parseInt(e.target.value) || 0)}
            />
            <Field.HelperText>Ignore blips shorter than this.</Field.HelperText>
          </Field.Root>

          <Stack direction="row" align="center" gap={3}>
            <Button colorPalette="brand" onClick={save}>
              Save
            </Button>
            {saved && (
              <Text fontSize="sm" color={usingMock ? 'orange.500' : 'green.500'}>
                {usingMock ? 'Saved locally (no device)' : 'Saved to device'}
              </Text>
            )}
          </Stack>
        </Stack>
      </Card.Body>
    </Card.Root>
  )
}
