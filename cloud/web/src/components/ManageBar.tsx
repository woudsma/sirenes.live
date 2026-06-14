import { useEffect, useRef, useState } from 'react'
import { Badge, Button, HStack, IconButton, Input, Stack, Text } from '@chakra-ui/react'
import { LuLock, LuLockOpen } from 'react-icons/lu'

// Gate for the "deletes locked" model: the site is publicly viewable, but
// deleting/clearing requires the admin token. The token is verified against the
// server on unlock (only the correct one unlocks); once accepted it's kept in
// localStorage (by useCloud) and sent as X-Admin-Token on mutations.
interface Props {
  enabled: boolean
  onUnlock: (token: string) => Promise<boolean>
  onLock: () => void
}

export function ManageBar({ enabled, onUnlock, onLock }: Props) {
  const [token, setToken] = useState('')
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus the token field as soon as the form is revealed.
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  if (enabled) {
    return (
      <HStack>
        <Badge colorPalette="green" variant="subtle">
          <LuLockOpen /> Management unlocked
        </Badge>
        <Button size="xs" variant="outline" onClick={onLock}>
          <LuLock /> Lock
        </Button>
      </HStack>
    )
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const t = token.trim()
    if (!t || busy) return
    setBusy(true)
    setError(false)
    const ok = await onUnlock(t)
    setBusy(false)
    if (ok) {
      setToken('')
      setOpen(false)
    } else {
      setError(true)
      setToken('')
    }
  }

  // Collapsed by default: just a discreet lock icon. Clicking it reveals the
  // token field + unlock button.
  if (!open) {
    return (
      <IconButton aria-label="Manage" size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <LuLock />
      </IconButton>
    )
  }

  return (
    <Stack gap={1} align="end">
      <HStack as="form" gap={2} onSubmit={submit}>
        <Input
          ref={inputRef}
          type="password"
          size="sm"
          maxW="56"
          placeholder="Admin token"
          value={token}
          onChange={(e) => {
            setToken(e.target.value)
            if (error) setError(false)
          }}
          onBlur={() => {
            if (!token.trim()) {
              setOpen(false)
              setError(false)
            }
          }}
          borderColor={error ? 'red.500' : undefined}
          autoComplete="off"
        />
        <Button type="submit" size="sm" variant="outline" loading={busy} disabled={!token.trim()}>
          <LuLock /> Unlock
        </Button>
      </HStack>
      {error && (
        <Text fontSize="xs" color="red.500">
          Incorrect admin token
        </Text>
      )}
    </Stack>
  )
}
