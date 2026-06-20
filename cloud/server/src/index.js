import express from 'express'
import rateLimit from 'express-rate-limit'
import fs from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createStore } from './db.js'
import { loadCsv, DEFAULT_CSV } from './seed.js'
import { generateDemoEvents } from './demoData.js'
import { refreshWeather } from './weather.js'

// ---------------------------------------------------------------------------
// sirenes.live cloud archive.
//
// The ESP32 POSTs each detection's audio (a complete WAV, uploaded after the
// event ends) and its event metadata here. We store events in SQLite and audio
// as WAV files on a persistent volume (DATA_DIR), and serve the React site plus
// a public read API. Mutations are token-gated:
//   - ingest  (device → here)  : X-Device-Token == DEVICE_TOKEN
//   - delete  (browser admin)  : X-Admin-Token  == ADMIN_TOKEN
// Reads are public.
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url))

const DATA_DIR = process.env.DATA_DIR || join(__dirname, '../data')
const CLIPS_DIR = join(DATA_DIR, 'clips')
const DB_PATH = join(DATA_DIR, 'siren.db')
const WEB_DIR = process.env.WEB_DIR || join(__dirname, '../../web/dist')
const PORT = Number(process.env.PORT || 8080)
const DEVICE_TOKEN = process.env.DEVICE_TOKEN || ''
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || ''
const SAMPLE_RATE = Number(process.env.STREAM_SAMPLE_RATE || 8000)
const STREAM_BITS = Number(process.env.STREAM_BITS || 8) // 8-bit unsigned PCM
// Detection clips are mono 16 kHz/16-bit and capped at 5 s on the device (~160 KB).
// Reject anything well past that so a leaked device token can't fill the volume.
const MAX_CLIP_BYTES = Number(process.env.MAX_CLIP_BYTES || 2 * 1024 * 1024)

fs.mkdirSync(CLIPS_DIR, { recursive: true })
const store = createStore(DB_PATH)

// Keep daily temperatures (for the temp/siren correlation chart) current: once at
// startup, then every 6h. Best-effort — failures are logged inside refreshWeather.
const WEATHER_REFRESH_MS = 6 * 60 * 60 * 1000
refreshWeather(store)
setInterval(() => refreshWeather(store), WEATHER_REFRESH_MS).unref()

// --- helpers ---------------------------------------------------------------

const clipPath = (epoch) => join(CLIPS_DIR, `${epoch}.wav`)

// Wipe every event row and its audio. Shared by the admin "clear all" and the
// dev seed toggle, which both start from an empty store.
function clearAllEvents() {
  store.clear()
  for (const f of fs.readdirSync(CLIPS_DIR)) fs.rmSync(join(CLIPS_DIR, f), { force: true })
}

function tokenGuard(expected, header) {
  return (req, res, next) => {
    if (expected && req.get(header) === expected) return next()
    res.status(401).json({ ok: false, error: 'unauthorized' })
  }
}
const deviceAuth = tokenGuard(DEVICE_TOKEN, 'X-Device-Token')
const adminAuth = tokenGuard(ADMIN_TOKEN, 'X-Admin-Token')

const app = express()
app.disable('x-powered-by')
// Behind the k3s/Traefik ingress: trust the first proxy hop so req.ip (used by
// the rate limiter) reflects the real client via X-Forwarded-For, not the proxy.
app.set('trust proxy', 1)

// Minimal security headers (no CSP — the inline Matomo snippet would need a hash;
// HSTS belongs at the ingress). Cheap defenses against MIME sniffing, clickjacking,
// and referrer leakage.
app.use((_req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff')
  res.set('X-Frame-Options', 'DENY')
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  next()
})

// Rate-limit the API per client IP. Generous enough for the dashboard's 20 s poll
// (3 calls) and the device's per-detection posts, but blunts scraping/DoS of the
// uncached SQL-aggregating read endpoints. Static site assets are unaffected.
app.use(
  '/api/',
  rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { ok: false, error: 'rate limited' },
  })
)

// --- ingest (device → here) ------------------------------------------------

// Audio for one detection, uploaded after the event ends. The body is a complete
// WAV file (the device captures it to flash first, then POSTs it — streaming live
// during detection starved the ESP32's Edge Impulse DSP of heap). Stored verbatim
// as clips/<epoch>.wav. Keyed by ?epoch=<unix seconds>.
app.post('/api/ingest/audio', deviceAuth, (req, res) => {
  const epoch = parseInt(req.query.epoch, 10)
  if (!epoch) return res.status(400).json({ ok: false, error: 'bad epoch' })

  const path = clipPath(epoch)
  const ws = fs.createWriteStream(path)
  let dataBytes = 0
  let tooLarge = false

  req.on('data', (chunk) => {
    dataBytes += chunk.length
    // Abort + discard once the upload exceeds the cap, so an oversized (or
    // malicious) body can't fill the disk. 413 is sent on stream close below.
    if (!tooLarge && dataBytes > MAX_CLIP_BYTES) {
      tooLarge = true
      req.unpipe(ws)
      ws.destroy()
      fs.rmSync(path, { force: true })
      console.warn(`ingest audio  epoch=${epoch} rejected: > ${MAX_CLIP_BYTES} bytes`)
      // Send the 413 first, then drop the connection once it has flushed so the
      // client gets a real status instead of a bare socket reset.
      if (!res.headersSent) {
        res.status(413).json({ ok: false, error: 'clip too large' })
        res.on('finish', () => req.destroy())
      } else {
        req.destroy()
      }
    }
  })
  req.on('aborted', () => ws.destroy())
  ws.on('error', () => {
    if (!tooLarge && !res.headersSent) res.status(500).json({ ok: false, error: 'write failed' })
  })
  ws.on('finish', () => {
    if (tooLarge) return // 413 already sent; partial file removed
    if (dataBytes === 0) {
      fs.rmSync(path, { force: true }) // empty upload → no clip
    } else {
      store.markClip(epoch) // links audio if the event row already arrived
    }
    console.log(`ingest audio  epoch=${epoch} bytes=${dataBytes}`)
    res.json({ ok: true, bytes: dataBytes })
  })
  req.pipe(ws, { end: true })
})

// Event metadata, sent when the detection ends. has_clip is derived from whether
// the streamed WAV landed (audio is best-effort and may be missing).
app.post('/api/ingest/event', deviceAuth, express.json({ limit: '8kb' }), (req, res) => {
  const { epoch, durationS, peakDb, confidence } = req.body || {}
  if (!epoch) return res.status(400).json({ ok: false, error: 'bad epoch' })
  store.upsertEvent({
    epoch: parseInt(epoch, 10),
    durationS: Number(durationS) || 0,
    peakDb: Number(peakDb) || 0,
    confidence: Number(confidence) || 0,
    hasClip: fs.existsSync(clipPath(epoch)) ? 1 : 0,
  })
  console.log(`ingest event  epoch=${epoch} peakDb=${peakDb} dur=${durationS}s`)
  res.json({ ok: true })
})

// --- public read API -------------------------------------------------------

app.get('/api/events', (req, res) => {
  // ?limit=all returns the full history for the event log's virtualized table;
  // otherwise it's a capped page.
  if (req.query.limit === 'all') return res.json(store.listAllEvents())
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 500)
  const offset = parseInt(req.query.offset, 10) || 0
  res.json(store.listEvents(limit, offset))
})

app.get('/api/stats', (_req, res) => {
  res.json(store.stats())
})

// Richer report analytics (cloud-only; /api/stats stays firmware-compatible).
app.get('/api/insights', (_req, res) => {
  res.json(store.insights())
})

app.get('/api/events.csv', (_req, res) => {
  res.type('text/csv')
  res.write('epoch,duration_s,peak_db,confidence,clip\n')
  for (const e of store.allEvents()) {
    res.write(`${e.ts},${e.durationS},${e.peakDb},${e.confidence},${e.clip ? `${e.ts}.wav` : ''}\n`)
  }
  res.end()
})

// Detection clips are private until an admin has reviewed them: the event still
// shows up in the public log, but the audio only plays once reviewed (or for the
// admin). Admins authenticate with the admin token via the X-Admin-Token header
// or a ?token= query param — <audio> elements and download links can't set
// headers, so the query param is what the dashboard actually uses.
app.get('/api/clip/:name', (req, res) => {
  const m = /^(\d+)\.wav$/.exec(req.params.name)
  if (!m) return res.status(400).json({ ok: false, error: 'bad name' })
  const epoch = parseInt(m[1], 10)
  const ev = store.getEvent(epoch)
  if (!ev || !ev.has_clip) return res.status(404).json({ ok: false, error: 'not found' })
  if (!ev.reviewed) {
    const token = req.get('X-Admin-Token') || req.query.token
    if (!ADMIN_TOKEN || token !== ADMIN_TOKEN)
      return res.status(403).json({ ok: false, error: 'forbidden' })
  }
  const path = clipPath(epoch)
  if (!fs.existsSync(path)) return res.status(404).json({ ok: false, error: 'not found' })
  res.sendFile(path) // express handles Range requests (audio seeking)
})

// --- management (browser admin) --------------------------------------------

// Validate an admin token (used by the UI's unlock form so a wrong token is
// rejected up front instead of only failing later on a mutation). 200 = valid.
app.get('/api/admin/check', adminAuth, (_req, res) => res.json({ ok: true }))

// Mark an event reviewed (admin listened to its clip). One-way: review only.
app.post('/api/events/review', adminAuth, (req, res) => {
  const ts = parseInt(req.query.ts, 10)
  if (!ts) return res.status(400).json({ ok: false, error: 'bad ts' })
  const ok = store.markReviewed(ts)
  res.status(ok ? 200 : 404).json({ ok })
})

app.delete('/api/events', adminAuth, (req, res) => {
  if (req.query.ts) {
    const ts = parseInt(req.query.ts, 10)
    const ok = store.deleteEvent(ts)
    fs.rmSync(clipPath(ts), { force: true })
    return res.status(ok ? 200 : 404).json({ ok })
  }
  clearAllEvents()
  res.json({ ok: true })
})

// --- dev-only seed toggle --------------------------------------------------

// Lets the local dashboard switch its demo data between the bundled sample CSV
// and a generated ~3-month dataset (so the calendar/heatmap tiles have something
// to show). Only mounted when ALLOW_DEV_SEED=1, so it never exists in production.
if (process.env.ALLOW_DEV_SEED === '1') {
  app.post('/api/dev/seed', express.json(), (req, res) => {
    const dataset = req.body?.dataset === 'demo' ? 'demo' : 'sample'
    clearAllEvents()
    let count
    if (dataset === 'demo') {
      const events = generateDemoEvents({ days: 90 })
      for (const e of events) store.upsertEvent(e)
      count = events.length
    } else {
      count = loadCsv(store, DEFAULT_CSV)
    }
    console.log(`dev seed: loaded ${count} events (${dataset})`)
    refreshWeather(store) // backfill temps for the freshly seeded dates
    res.json({ ok: true, dataset, count })
  })
  console.warn('  DEV: /api/dev/seed enabled (ALLOW_DEV_SEED=1)')
}

// --- health + static site --------------------------------------------------

app.get('/healthz', (_req, res) => res.json({ ok: true }))

app.use(express.static(WEB_DIR))
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ ok: false, error: 'not found' })
  res.sendFile(join(WEB_DIR, 'index.html'))
})

const server = app.listen(PORT, () => {
  console.log(`sirenes.live cloud listening on :${PORT}`)
  console.log(`  data dir : ${DATA_DIR}`)
  console.log(`  web dir  : ${WEB_DIR}`)
  console.log(`  audio    : ${SAMPLE_RATE} Hz / ${STREAM_BITS}-bit mono`)
  if (!DEVICE_TOKEN) console.warn('  WARNING: DEVICE_TOKEN not set — ingest is disabled')
  if (!ADMIN_TOKEN) console.warn('  WARNING: ADMIN_TOKEN not set — management is disabled')
})

// Graceful shutdown. The container runs node as PID 1, which the kernel does NOT
// give the default "terminate on SIGTERM" behavior — without an explicit handler
// node ignores SIGTERM and Kubernetes waits the full terminationGracePeriod (~30s)
// before SIGKILL on every rollout. Closing the server lets the old pod exit in
// well under a second, so `Recreate` can bring the new pod up immediately.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    console.log(`${sig} received — shutting down`)
    server.close(() => process.exit(0))
    // Don't let lingering keep-alive connections hold the process open.
    setTimeout(() => process.exit(0), 2000).unref()
  })
}
