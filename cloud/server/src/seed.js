import fs from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createStore } from './db.js'

// Seed the local dev database from a CSV export — the same shape /api/events.csv
// produces (epoch,duration_s,peak_db,confidence,clip), so a dump from the live
// site drops straight in. Idempotent (rows upsert by epoch). Local dev only —
// never point this at the production data volume.
//
// `loadCsv` is reused by the dev-only /api/dev/seed endpoint (see index.js); the
// CLI entrypoint below keeps the count>0/--force guard.

const __dirname = dirname(fileURLToPath(import.meta.url))

export const DEFAULT_CSV = join(__dirname, '../seed/events.csv')

// Parse a CSV export and upsert every row into `store`. Returns the count.
export function loadCsv(store, csvPath = DEFAULT_CSV) {
  const lines = fs.readFileSync(csvPath, 'utf8').trim().split('\n')
  lines.shift() // drop the header row

  let n = 0
  for (const line of lines) {
    if (!line.trim()) continue
    const [epoch, durationS, peakDb, confidence] = line.split(',')
    store.upsertEvent({
      epoch: parseInt(epoch, 10),
      durationS: Number(durationS) || 0,
      peakDb: Number(peakDb) || 0,
      confidence: Number(confidence) || 0,
      hasClip: 0, // audio clips aren't part of the CSV export, so none are linked
    })
    n++
  }
  return n
}

// CLI entrypoint: only run when invoked directly (not when imported).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const DATA_DIR = process.env.DATA_DIR || join(__dirname, '../data')
  const DB_PATH = join(DATA_DIR, 'siren.db')
  const CSV_PATH = process.env.SEED_CSV || DEFAULT_CSV
  const force = process.argv.includes('--force')

  const store = createStore(DB_PATH)
  const existing = store.count()
  if (existing > 0 && !force) {
    console.log(`seed: DB already has ${existing} events — skipping (use --force to re-import)`)
    process.exit(0)
  }
  const n = loadCsv(store, CSV_PATH)
  console.log(`seed: imported ${n} events from ${CSV_PATH}`)
}
