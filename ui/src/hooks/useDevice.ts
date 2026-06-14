import { useCallback, useEffect, useRef, useState } from 'react'
import type { Status, Stats, EventsResponse, DeviceConfig } from '../types'
import { MOCK_STATS, MOCK_EVENTS, MOCK_CONFIG } from '../mock/data'
import { demoSirenClip } from '../mock/sirenClip'

// Connects to the device: live status over WebSocket, stats/events/config over
// REST. When no device responds (dev server), it falls back to mock data so the
// UI is fully designable offline.
export function useDevice() {
  const [status, setStatus] = useState<Status | null>(null)
  const [stats, setStats] = useState<Stats>(MOCK_STATS)
  const [events, setEvents] = useState<EventsResponse>(MOCK_EVENTS)
  const [config, setConfig] = useState<DeviceConfig>(MOCK_CONFIG)
  const [connected, setConnected] = useState(false)
  const [usingMock, setUsingMock] = useState(true)

  const wsRef = useRef<WebSocket | null>(null)

  // Keep latest values accessible inside callbacks without re-subscribing.
  const statsRef = useRef(stats)
  statsRef.current = stats
  const connectedRef = useRef(connected)
  connectedRef.current = connected
  // Mirrors the detection on/off toggle so the offline status synth keeps it.
  const pausedRef = useRef(false)

  // --- live status over WebSocket ---
  useEffect(() => {
    let cancelled = false
    function connect() {
      let ws: WebSocket
      try {
        ws = new WebSocket(`ws://${location.host}/ws`)
      } catch {
        return
      }
      wsRef.current = ws
      ws.onopen = () => !cancelled && setConnected(true)
      ws.onclose = () => {
        if (cancelled) return
        setConnected(false)
        setTimeout(connect, 2500)
      }
      ws.onerror = () => ws.close()
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data)
          if (data.type === 'status') setStatus(data as Status)
        } catch {
          /* ignore */
        }
      }
    }
    connect()
    return () => {
      cancelled = true
      wsRef.current?.close()
    }
  }, [])

  // --- synthesize a gentle live status when offline (dev) ---
  useEffect(() => {
    if (connected) return
    const id = setInterval(() => {
      setStatus({
        type: 'status',
        db: 44 + Math.random() * 9,
        score: 0.02 + Math.random() * 0.04,
        detecting: false,
        paused: pausedRef.current,
        catScore: 0.01 + Math.random() * 0.03,
        cat: false,
        today: statsRef.current.today,
        total: statsRef.current.total,
        uptimeS: Math.floor(Date.now() / 1000) % 100000,
        timeValid: true,
        host: 'siren-detector.local',
        freeHeap: 205000 + Math.floor(Math.random() * 6000),
        heapSize: 327680,
        fsUsed: 270336,
        fsTotal: 917504,
      })
    }, 700)
    return () => clearInterval(id)
  }, [connected])

  // --- stats + events over REST ---
  const refresh = useCallback(async () => {
    try {
      const [s, e] = await Promise.all([
        fetch('/api/stats').then((r) => r.json()),
        fetch('/api/events?limit=50').then((r) => r.json()),
      ])
      if (s && Array.isArray(s.perDay) && Array.isArray(s.perHour)) {
        setStats(s)
        setEvents(e)
        setUsingMock(false)
        return
      }
      throw new Error('unexpected response shape')
    } catch {
      setStats(MOCK_STATS)
      setEvents(MOCK_EVENTS)
      setUsingMock(true)
    }
  }, [])

  useEffect(() => {
    refresh() // one attempt on load to detect a device
    const id = setInterval(() => {
      if (connectedRef.current) refresh() // afterwards only poll a real device
    }, 15000)
    return () => clearInterval(id)
  }, [refresh])

  // --- config ---
  const loadConfig = useCallback(async () => {
    try {
      const c = await fetch('/api/config').then((r) => r.json())
      if (c && typeof c.cal_offset_db === 'number') setConfig(c)
    } catch {
      setConfig(MOCK_CONFIG)
    }
  }, [])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  const saveConfig = useCallback(async (next: DeviceConfig) => {
    setConfig(next)
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
    } catch {
      /* offline: keep local */
    }
  }, [])

  // Optimistically drop an event locally, then tell the device to delete it.
  const deleteEvent = useCallback(
    async (ts: number) => {
      setEvents((prev) => ({
        total: Math.max(0, prev.total - 1),
        events: prev.events.filter((e) => e.ts !== ts),
      }))
      if (!connectedRef.current) return
      try {
        await fetch(`/api/events?ts=${ts}`, { method: 'DELETE' })
        setTimeout(refresh, 300)
      } catch {
        /* offline: local removal stands */
      }
    },
    [refresh]
  )

  // Delete every event (and its clip) on the device, or just locally when offline.
  const clearEvents = useCallback(async () => {
    setEvents({ total: 0, events: [] })
    if (!connectedRef.current) return
    try {
      await fetch('/api/events', { method: 'DELETE' })
      setTimeout(refresh, 300)
    } catch {
      /* offline: local clear stands */
    }
  }, [refresh])

  // Add a synthetic event to the local demo state (used when no device is present).
  const addLocalEvent = useCallback(() => {
    const ts = Math.floor(Date.now() / 1000)
    const ev = {
      ts,
      durationS: 4 + Math.floor(Math.random() * 16),
      peakDb: 80 + Math.round(Math.random() * 180) / 10,
      confidence: 0.9 + Math.round(Math.random() * 90) / 1000,
      clip: demoSirenClip(),
    }
    setEvents((prev) => ({ total: prev.total + 1, events: [ev, ...prev.events].slice(0, 100) }))
    setStats((prev) => {
      const todayStr = new Date().toISOString().slice(0, 10)
      const perDay = prev.perDay.map((d) => ({ ...d }))
      const last = perDay[perDay.length - 1]
      if (last && last.date === todayStr) {
        last.count += 1
        last.peakDb = Math.max(last.peakDb, ev.peakDb)
      } else {
        perDay.push({ date: todayStr, count: 1, peakDb: ev.peakDb })
      }
      const perHour = [...prev.perHour]
      perHour[new Date().getHours()] += 1
      const bin = ev.peakDb < 70 ? 0 : ev.peakDb < 80 ? 1 : ev.peakDb < 90 ? 2 : ev.peakDb < 100 ? 3 : 4
      const dbHistogram = prev.dbHistogram.map((b, i) =>
        i === bin ? { ...b, count: b.count + 1 } : b
      )
      return { ...prev, today: prev.today + 1, total: prev.total + 1, perDay, perHour, dbHistogram }
    })
  }, [])

  // --- inject a test event: hits the device, or updates demo data when offline ---
  const simulate = useCallback(async () => {
    // No device connected (e.g. dev server) → update demo data without a network call.
    if (!connectedRef.current) {
      addLocalEvent()
      return
    }
    try {
      const res = await fetch('/api/sim/event', { method: 'POST' })
      if (!res.ok) throw new Error('no device')
      setTimeout(refresh, 500)
    } catch {
      addLocalEvent()
    }
  }, [refresh, addLocalEvent])

  // Pause/resume detection. Optimistically reflects the new state (the device's
  // 5 Hz WS push soon overwrites it with the authoritative value); offline it just
  // drives the demo status synth via pausedRef.
  const setDetecting = useCallback(async (enabled: boolean) => {
    pausedRef.current = !enabled
    setStatus((prev) => (prev ? { ...prev, paused: !enabled } : prev))
    if (!connectedRef.current) return
    try {
      await fetch(`/api/detect?on=${enabled ? 'true' : 'false'}`, { method: 'POST' })
    } catch {
      /* offline: optimistic state stands */
    }
  }, [])

  return {
    status,
    stats,
    events,
    config,
    connected,
    usingMock,
    refresh,
    saveConfig,
    simulate,
    setDetecting,
    deleteEvent,
    clearEvents,
  }
}
