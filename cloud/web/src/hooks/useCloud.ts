import { useCallback, useEffect, useRef, useState } from 'react'
import type { EventsResponse, Insights, Stats } from '../types'

// REST-only client for the cloud archive (same-origin). Unlike the on-device
// useDevice hook there is no WebSocket / live status — the VPS can't reach the
// ESP32 behind home NAT, so this site shows the stored history only. Management
// (delete/clear) sends the admin token, kept in localStorage.

const EMPTY_STATS: Stats = {
  today: 0,
  total: 0,
  perDay: [],
  perHour: Array(24).fill(0),
  dbHistogram: [
    { bin: '<70', count: 0 },
    { bin: '70-80', count: 0 },
    { bin: '80-90', count: 0 },
    { bin: '90-100', count: 0 },
    { bin: '>=100', count: 0 },
  ],
}

const EMPTY_INSIGHTS: Insights = {
  kpis: {
    total: 0,
    totalSeconds: 0,
    avgPerDay: 0,
    daysActive: 0,
    busiestDay: { date: null, count: 0 },
    busiestHour: { date: null, hour: 0, count: 0 },
    loudestDb: 0,
    avgDb: 0,
    avgDurationS: 0,
    longestEventS: 0,
    longestQuietStreakS: 0,
    quietStreak: { from: null, to: null },
  },
  calendar: [],
  weekdayHour: [],
  weekdayHourByWeek: [],
}

const TOKEN_KEY = 'siren.adminToken'

export function useCloud() {
  const [stats, setStats] = useState<Stats>(EMPTY_STATS)
  const [insights, setInsights] = useState<Insights>(EMPTY_INSIGHTS)
  const [events, setEvents] = useState<EventsResponse>({ total: 0, unreviewed: 0, events: [] })
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [adminToken, setAdminTokenState] = useState<string>(
    () => localStorage.getItem(TOKEN_KEY) || ''
  )

  const tokenRef = useRef(adminToken)
  tokenRef.current = adminToken

  const refresh = useCallback(async () => {
    try {
      const [s, e, ins] = await Promise.all([
        fetch('/api/stats').then((r) => r.json()),
        fetch('/api/events?limit=200').then((r) => r.json()),
        fetch('/api/insights').then((r) => r.json()),
      ])
      if (s && Array.isArray(s.perDay) && Array.isArray(s.perHour)) {
        setStats(s)
        setEvents(e)
        if (ins && Array.isArray(ins.calendar) && Array.isArray(ins.weekdayHour)) setInsights(ins)
        setError(null)
      } else {
        throw new Error('unexpected response shape')
      }
    } catch {
      setError('Could not reach the server')
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 20000)
    return () => clearInterval(id)
  }, [refresh])

  const setAdminToken = useCallback((t: string) => {
    if (t) localStorage.setItem(TOKEN_KEY, t)
    else localStorage.removeItem(TOKEN_KEY)
    setAdminTokenState(t)
  }, [])

  // Verify a candidate admin token against the server before unlocking, so a
  // wrong token is rejected immediately rather than silently failing on the first
  // mutation. Returns true (and stores the token) only on a 200.
  const unlock = useCallback(
    async (token: string): Promise<boolean> => {
      try {
        const r = await fetch('/api/admin/check', { headers: { 'X-Admin-Token': token } })
        if (r.ok) {
          setAdminToken(token)
          return true
        }
      } catch {
        /* network error → treat as not unlocked */
      }
      return false
    },
    [setAdminToken]
  )

  // Re-validate a token restored from localStorage on load; clear it if the
  // server no longer accepts it (e.g. ADMIN_TOKEN rotated) so the UI doesn't show
  // a phantom-unlocked state. Network errors are ignored (don't lock when offline).
  useEffect(() => {
    const t = tokenRef.current
    if (!t) return
    fetch('/api/admin/check', { headers: { 'X-Admin-Token': t } })
      .then((r) => {
        if (!r.ok) setAdminToken('')
      })
      .catch(() => {})
  }, [setAdminToken])

  // Optimistically drop locally, then ask the server; refetch to reconcile (e.g.
  // a 401 if the token is wrong puts the event back).
  const deleteEvent = useCallback(
    async (ts: number) => {
      setEvents((prev) => {
        const removed = prev.events.find((e) => e.ts === ts)
        return {
          total: Math.max(0, prev.total - 1),
          unreviewed: Math.max(0, prev.unreviewed - (removed && !removed.reviewed ? 1 : 0)),
          events: prev.events.filter((e) => e.ts !== ts),
        }
      })
      try {
        const r = await fetch(`/api/events?ts=${ts}`, {
          method: 'DELETE',
          headers: { 'X-Admin-Token': tokenRef.current },
        })
        if (!r.ok) throw new Error('delete failed')
      } catch {
        /* reconcile below */
      }
      setTimeout(refresh, 300)
    },
    [refresh]
  )

  const clearEvents = useCallback(async () => {
    setEvents({ total: 0, unreviewed: 0, events: [] })
    try {
      const r = await fetch('/api/events', {
        method: 'DELETE',
        headers: { 'X-Admin-Token': tokenRef.current },
      })
      if (!r.ok) throw new Error('clear failed')
    } catch {
      /* reconcile below */
    }
    setTimeout(refresh, 300)
  }, [refresh])

  // Mark an event reviewed once its clip is played. Optimistic: flip the row and
  // drop the to-review counter immediately, then persist; refresh reconciles.
  const markReviewed = useCallback(
    async (ts: number) => {
      let changed = false
      setEvents((prev) => {
        const eventsNext = prev.events.map((e) => {
          if (e.ts === ts && !e.reviewed) {
            changed = true
            return { ...e, reviewed: true }
          }
          return e
        })
        if (!changed) return prev
        return { ...prev, unreviewed: Math.max(0, prev.unreviewed - 1), events: eventsNext }
      })
      if (!changed) return // already reviewed — no request needed
      try {
        const r = await fetch(`/api/events/review?ts=${ts}`, {
          method: 'POST',
          headers: { 'X-Admin-Token': tokenRef.current },
        })
        if (!r.ok) throw new Error('review failed')
      } catch {
        /* reconcile below */
      }
      setTimeout(refresh, 300)
    },
    [refresh]
  )

  // Dev-only: switch the demo data between the sample CSV and a generated
  // 3-month dataset. The endpoint only exists when the server runs with
  // ALLOW_DEV_SEED=1 (see DevSeedToggle, gated on import.meta.env.DEV).
  const seedDataset = useCallback(
    async (dataset: 'sample' | 'demo') => {
      await fetch('/api/dev/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataset }),
      })
      await refresh()
    },
    [refresh]
  )

  return {
    stats,
    insights,
    events,
    loaded,
    error,
    refresh,
    deleteEvent,
    clearEvents,
    markReviewed,
    seedDataset,
    adminToken,
    unlock,
    setAdminToken,
    manageEnabled: !!adminToken,
  }
}
