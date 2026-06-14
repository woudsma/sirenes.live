import { Box, Popover, Portal } from '@chakra-ui/react'
import { LuInfo } from 'react-icons/lu'

// Tap/click "i" icon explaining how a stat or chart is calculated. Uses a Popover
// (not a hover tooltip) so it works on touch devices as well as desktop. Portaled
// so it never clips against the card edge. Shared by the KPI tiles and chart titles.
export function InfoTip({ text }: { text: string }) {
  return (
    <Popover.Root positioning={{ placement: 'top' }} lazyMount unmountOnExit>
      <Popover.Trigger asChild>
        <Box
          as="button"
          display="inline-flex"
          color="fg.muted"
          cursor="pointer"
          aria-label="How this is calculated"
        >
          <LuInfo size={13} />
        </Box>
      </Popover.Trigger>
      <Portal>
        <Popover.Positioner>
          <Popover.Content width="auto" maxW="240px">
            <Popover.Arrow />
            <Popover.Body fontSize="xs" color="fg.muted" py={2} px={3}>
              {text}
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  )
}
