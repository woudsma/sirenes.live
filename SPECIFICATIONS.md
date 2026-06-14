# Specifications

> **This file is the source of truth** for the Siren Detector hardware and software.
> When something changes (a pin, a threshold, a dependency), update it here first.

## 0. Goal

An always-on device that listens near a window, **detects emergency-vehicle sirens**
(Dutch two-tone _Martinshorn_ + electronic yelp/wail), **counts** them, and **logs the
loudness (dB SPL) and time** of each event. It connects to home WiFi on boot and serves its
own web page (`http://siren-detector.local`) showing occurrence/loudness/time-of-day graphs.
Runs 24/7, low power, safe to leave unattended.

---

## 1. Electronics

### MCU

- **ESP32-WROOM-32 DevKit V1** (dual-core, 240 MHz, 4 MB flash, 520 KB SRAM, **no PSRAM**).
- WiFi for connectivity + NTP time. Bluetooth disabled in firmware to save power.

### Microphone

- **Adafruit ICS-43434** I2S MEMS breakout.
- Digital I2S (24-bit), omnidirectional, sensitivity **−26 dBFS @ 94 dB SPL @ 1 kHz**, SNR ~65 dB.
- Chosen over analog mics: no ADC noise, immune to WiFi-induced ADC noise, and the known
  sensitivity makes dB SPL **calibratable**.

### Status LED

- **WS2812 (addressable RGB)**, single data wire, driven by FastLED.
- Patterns: blue pulse = WiFi connecting · green = listening/idle ·
  **dim blue pulse = siren-like sound heard (~0.5 s confirm, not yet a counted event)** ·
  **bright blue flash = confirmed siren event (will be logged)** · amber breathe = detection
  paused · red = error (mic/FS/WiFi). The detection LED reacts near-real-time on both edges
  (back to green within ~250 ms of the siren stopping) while event _counting_ keeps the 5 s
  minimum + 3 s hang.

### Power

- **5 V USB wall charger** (≥1 A, reputable brand) into the DevKit USB port. **Not** a power bank.
- Estimated draw **0.9–1.3 W** at the wall (continuous sampling + inference + WiFi, no deep sleep,
  **modem sleep off** for network reliability — see the network watchdog section).
- Cost ≈ **€2–3/year** at €0.30–0.40/kWh.

### GPIO allocation

All signal pins are on the breadboard's **bottom row** (the 3V3/GND side) so the board can sit
flush against the top rail. Avoids the USB UART (GPIO1/3) and strapping pins (GPIO2/5/15).

| Signal            | GPIO  | Board label | Notes                    |
| ----------------- | ----- | ----------- | ------------------------ |
| I2S BCLK (SCK)    | 16    | RX2         | mic bit clock            |
| I2S WS (LRCL)     | 17    | TX2         | mic word select          |
| I2S DATA (SD→ESP) | 18    | D18         | mic data in              |
| Mic SEL           | → GND | —           | selects left channel     |
| Mic VIN / 3V      | → 3V3 | 3V3         | bottom-row power         |
| WS2812 DIN        | 4     | D4          | optional ~330 Ω series   |
| Onboard blue LED  | 2     | D2          | boot heartbeat (no wire) |

> I2S pins are defined in `firmware/include/pins.h`. Avoid the flash pins (6–11) and the
> input-only pins (34–39) for clock/data outputs.

---

## 2. Software — Firmware (`firmware/`)

PlatformIO, Arduino framework, board `esp32dev`.

- **Filesystem:** LittleFS (web UI + event log).
- **Partition:** `huge_app.csv` (3 MB app, ~1 MB FS) — the Edge Impulse model + SDK make the
  binary too large for the default 1.25 MB app partition.
- **Libraries:** ESPAsyncWebServer + AsyncTCP (web), FastLED (LED), ArduinoJson (API/config),
  Edge Impulse exported library (added in M3, lives in `firmware/lib/`).

### Dual-core split

- **Core 0 (`audio_task`, 12 KB stack):** I2S read → RMS → dB SPL → Edge Impulse inference → event state machine.
- **Core 1 (Arduino loop):** WiFi/mDNS/NTP, AsyncWebServer, LED updates, 2 Hz WS status broadcast,
  network watchdog.

### Memory architecture (no PSRAM — this is what keeps the device alive 24/7)

- **Dedicated Edge Impulse heap (`ei_pool.cpp`):** the EI DSP allocates ~20–30 KB of MFCC/FFT
  scratch on **every 250 ms slice**. It used to come from the system heap, where it raced
  WiFi/AsyncTCP/WebSocket buffers — a web-UI load could starve the DSP (`EIDSP_OUT_OF_MEM`,
  -1002) until the recovery ladder rebooted the board. The firmware now provides **strong
  overrides of the SDK's weak `ei_malloc`/`ei_calloc`/`ei_free`**, backed by a 40 KB pool
  (`EI_POOL_BYTES`, carved from the heap once at boot, managed with ESP-IDF `multi_heap`).
  Inference and WiFi can no longer starve each other, in either direction. Sizing: watch the
  `EIpool free/low/fb` numbers in the 10 s serial diagnostic — measured peak use is ~34 KB,
  and the fallback counter (`fb`) must stay 0.
- **Heap guards:** API endpoints shed with 503 below 40 KB free / 18 KB largest block
  (`webserver.cpp`); the WS broadcast skips frames under the same conditions and is capped at
  **2 clients** (oldest closed first).
- **UI bundle caching:** static files are served with `Cache-Control: no-cache` and answer
  conditional requests with **304** (ETag from the gzip CRC), so a browser reload revalidates
  with a tiny response instead of re-downloading the ~248 KB bundle — the single heaviest
  transfer this server does.

### Network watchdog (`net_watchdog.cpp`)

Under a burst of parallel/aborted transfers the TCP/IP stack can wedge: WiFi stays associated
but nothing answers ARP/ICMP/TCP anymore, permanently — fatal for a headless device. The
watchdog pings the gateway every 15 s and escalates: **60 s silent → WiFi reconnect; 150 s →
controlled reboot**, but never while a detection event is in progress (events + clips are on
LittleFS). A plain WiFi drop (router down) is _not_ treated as a wedge — auto-reconnect owns
that and detection keeps running offline. Modem sleep is **off** (`WiFi.setSleep(false)`):
with it on, large transfers stalled mid-flight under concurrent traffic (~0.3–0.5 W extra).

### Modules (`firmware/src/`)

| File               | Purpose                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `main.cpp`         | setup/loop, task creation, status broadcast                                                                         |
| `audio.cpp`        | I2S init (ICS-43434), frame reads, RMS → **dB SPL** (calibrated)                                                    |
| `detector.cpp`     | Edge Impulse inference wrapper + siren event state machine (start/peak-dB/duration/end) + fast two-stage LED signal |
| `ei_pool.cpp`      | dedicated EI heap: strong `ei_malloc`/`ei_calloc`/`ei_free` overrides over a 40 KB `multi_heap` pool                |
| `net_watchdog.cpp` | gateway-ping watchdog: detects a wedged TCP/IP stack → reconnect → controlled reboot                                |
| `events.cpp`       | LittleFS event log (CSV), daily/hourly/dB aggregation, JSON serialization                                           |
| `cloud.cpp`        | streams detection audio + posts events to the VPS archive (core-1 task, §7)                                         |
| `webserver.cpp`    | AsyncWebServer: serve UI, REST + WebSocket, config, CSV export                                                      |
| `wifi_setup.cpp`   | STA + AP fallback, mDNS, NTP time sync (TZ = Europe/Amsterdam)                                                      |
| `leds.cpp`         | FastLED WS2812 status patterns                                                                                      |

> **Status (M3):** the full pipeline is live — real I2S capture (`audio.cpp`), the exported Edge
> Impulse classifier running in continuous mode (`detector.cpp`), the event state machine, event
> log, web API, and cloud streaming. Remaining work is M4 polish (threshold/calibration tuning).

### dB SPL calibration

`dB_SPL ≈ 20·log10(rms / FULL_SCALE) + (94 − MIC_SENSITIVITY_DBFS) + CAL_OFFSET_DB`

- `MIC_SENSITIVITY_DBFS = −26`, `CAL_OFFSET_DB` tuned in M1 against a phone SPL-meter app
  (editable live in the Settings page; persisted to `/settings.json`).
- `FULL_SCALE = 2^31` (the ICS-43434's 24-bit sample is left-justified in a 32-bit I2S frame).
- All constants live in `firmware/include/config.h`.

> **ESP32 I2S channel quirk (important):** with SEL→GND (left channel) the legacy driver
> returns silence under `I2S_CHANNEL_FMT_ONLY_LEFT` — the data actually lands under
> **`I2S_CHANNEL_FMT_ONLY_RIGHT`**. That's what `audio.cpp` uses. If a future mic/board reads
> all zeros, temporarily switch to `RIGHT_LEFT` (stereo) and print both slots to see which one
> carries data.

### Event record (CSV: `/events.csv` on LittleFS)

`epoch,duration_s,peak_db,confidence,clip` — e.g. `1717245600,8,92.4,0.97,1717245600.mp3`
(the `clip` field is empty when no audio was saved). Compact; a year of dozens/day ≈ a few
hundred KB. Rotation TODO if it grows.

### Detection clips → captured to flash, then uploaded to the VPS (store-and-forward)

Each detection saves a short mono 16 kHz/16-bit clip to `/clips/` on LittleFS (`clips.cpp`,
FIFO-budgeted at `CLIPS_MAX_BYTES`, length-capped at `CLIP_MAX_SECONDS` = 5 s) **during** the event.
Capture starts `CLIP_START_DELAY_MS` (2 s) after the event opens, shifting the 5 s window toward
the loudest part of the pass-by (the event already opens ~5 s into the siren, so the clip covers
roughly seconds 7–12). When the event ends, the detector hands the finished clip to the cloud task
(`cloud_upload_clip()`), which **uploads it as WAV + posts the event to the VPS after the
detection** and, on a successful upload, **deletes the local copy** (`clips_request_remove()` →
`clips_service()` runs the delete on core 0). Clips that fail to upload stay and the FIFO rotates
them.

> **Clips are stored as RAW PCM (`<epoch>.pcm`), not WAV** — the 44-byte header is prepended on
> the fly when the clip is served (`/api/clip`) or uploaded (`cloud.cpp`); see `wav_format.h`.
> The old scheme wrote a placeholder header and seeked back to fill in the sizes at finalize,
> which makes LittleFS **copy-on-write the whole file** (CTZ skip-list): a 160 KB clip
> transiently needed another ~160 KB free at close, and with the partition tight (clips FIFO
> full of upload-pending detections) `lfs_alloc` divided by zero and **rebooted the board
> mid-listening**. This is also why 9–11 s recordings crashed in M2 while 6 s worked. Raw PCM
> with header-on-read eliminates that entire failure class. The same applies to `/rec.pcm`
> (Record tab).

> **Why not stream live?** An earlier version streamed audio to the VPS _during_ the detection.
> On this board (no PSRAM, **~70 KB free heap** with the EI model resident) running WiFi alongside
> the Edge Impulse DSP starved the DSP (`EIDSP_OUT_OF_MEM` / `Failed to run DSP process (-1002)`),
> froze the classifier score, and stalled detection — the same heap wall the record-download path
> hits. Store-and-forward keeps WiFi off the critical path: the upload happens **after** the event,
> with the 5 Hz WS broadcast paused (`webserver_pause_ws()`), mirroring the proven-stable download.
> The 5 s cap is the deliberate trade (LittleFS can't reliably hold a longer growing WAV — see the
> Record-tab constraints below). `events.csv` stays local (offline record + on-device UI history).
> Module: `firmware/src/cloud.cpp`.

### Web/API surface

| Endpoint                               | Purpose                                                                          |
| -------------------------------------- | -------------------------------------------------------------------------------- |
| `GET /`                                | serve gzipped React UI from LittleFS                                             |
| `WS /ws`                               | live push: dB, state, classifier score, today's count, uptime                    |
| `GET /api/stats`                       | aggregates: today, total, per-day, per-hour, dB histogram                        |
| `GET /api/events?limit=&offset=`       | paginated event list                                                             |
| `GET /api/events.csv`                  | raw log download                                                                 |
| `GET /api/clip?f=<name>`               | serve a detection's MP3 clip                                                     |
| `POST /api/record/start?label=`        | begin a labeled WAV recording (M2)                                               |
| `POST /api/record/stop`                | stop the recording                                                               |
| `GET /api/record/status`               | `{recording, seconds, label, maxSeconds, hasFile}`                               |
| `GET /api/record/download`             | download the recorded WAV (`<label>.wav`); **deletes `/rec.wav` after download** |
| `GET /api/config` / `POST /api/config` | thresholds + dB calibration offset                                               |
| `POST /api/sim/event`                  | inject a synthetic event (testing without a mic)                                 |
| `POST /api/detect?on=true\|false`      | pause/resume detection (status JSON `paused`; amber LED while off)               |

---

## 3. Software — Web UI (`ui/`)

Vite + React 18 + TypeScript + **Chakra UI v3**. Built (gzipped) into `firmware/data/` via
`vite-plugin-compression` and auto-built before filesystem upload by `scripts/build_ui.py`.

- **Live status:** dB meter, classifier confidence, device state, uptime, today's count.
- **Graphs (Chakra v3 charts):** sirens per day (bar), time-of-day distribution (hourly),
  loudness distribution + peak-dB over time.
- **Event list:** timestamp, peak dB, duration, confidence; paginated/filterable.
- **Settings:** detection threshold/sensitivity, dB calibration offset, WiFi info.
- **Dev/test:** "Simulate detection" button (POST `/api/sim/event`); mock dataset used
  automatically when not connected to a device (dev server) so charts are designable offline.

---

### Data collection (M2)

The **Record** tab captures mono 16 kHz/16-bit audio through the live mic to `/rec.pcm` on
LittleFS (raw PCM, one clip at a time, auto-stops at `REC_MAX_SECONDS` = 5 s ≈ 160 KB), then
downloads it as `<label>.<ts>.wav` — the WAV header is prepended by the download handler
(`wav_format.h`). The file is **deleted as soon as it's downloaded** (and the previous clip is
freed when a new recording starts) — via `record_request_delete()`, flagged by the download
handler and executed on the audio task. Workflow: record several short samples per class
(`siren`, `traffic`, `quiet`) at the window → upload the WAVs to Edge Impulse Studio → Data
acquisition. Module: `firmware/src/record.cpp`; the audio task feeds it via `record_feed()`.

> **Hard-won constraints (see JOURNAL 2026-06-02 / 2026-06-04 / 2026-06-10):**
>
> 1. All recording filesystem I/O runs on the **audio task** (core 0); the HTTP handlers only
>    set flags. Doing LittleFS writes/close in the AsyncWebServer (`async_tcp`) handler tripped
>    the task watchdog on larger files and rebooted the board.
> 2. **Never rewrite a file's first block** (the old WAV header backfill): LittleFS
>    copy-on-writes the whole file, transiently needing ~2× the file size in free blocks, and
>    `lfs_alloc` divides-by-zero (reboot) instead of erroring when that isn't available. This —
>    not a "growing file ceiling" — is why ~480 KB recordings failed with 632 KB free, and why
>    a full clips FIFO crashed 5 s recordings at finalize. Fixed by storing raw PCM and
>    prepending the header at serve/upload time. The 5 s cap + 64 KB free margins stay as
>    belt-and-braces.
> 3. **Downloading the recording** (`GET /api/record/download`) is heap-sensitive: the WS status
>    push is paused while a download streams + a short cool-down after, and its `ws.textAll()`
>    alloc is wrapped in try/catch — an unguarded `bad_alloc` there reached `std::terminate`
>    and rebooted the board. The download is served as a chunked response so completion (filler
>    returns 0) is detectable for un-pausing. Module: `webserver.cpp`. (Less critical since the
>    EI pool: inference no longer competes for this heap.)

## 4. The TinyML detection pipeline (Edge Impulse)

1. **M1** bring up mic, verify clean audio + dB on serial, calibrate `CAL_OFFSET_DB`.
2. **M2** collect labeled audio in the _actual_ location via the device's data-collection mode
   (browser records raw I2S stream → WAV); classes: `siren`, `traffic`, `quiet`.
3. **M3** train in Edge Impulse Studio (MFE block + small NN, EON-compiled), check the studio's
   ESP32 RAM/flash/latency estimate fits, export Arduino lib → `firmware/lib/`, run
   `run_classifier_continuous` on the live stream.
4. Fuse classifier score with the **independent** dB SPL meter → log events.

**Fit budget (ESP32-WROOM, no PSRAM):** flash 4 MB (binary ~1.3–1.8 MB, fits `huge_app`);
RAM ~320 KB, WiFi+server ~80–120 KB, model arena ~30–80 KB → fits if the model stays lean
(~3 classes, MFE). Fallback if it ever doesn't fit: replace only `detector.cpp` with a DSP/FFT
two-tone heuristic (near-zero RAM).

---

## 5. Safety (runs 24/7, indoors near a window)

Entirely low-voltage (3.3–5 V) from a USB charger — no mains, no LiPo → essentially no fire
risk. Rules baked into the build:

- Reputable 5 V USB adapter; no cheap no-brand supplies, no bare-LiPo power banks.
- WS2812 runs dim for status (≤ ~60 mA worst case); never drive LEDs without the data-line resistor where applicable.
- Each GPIO ≤ ~12 mA.
- Any enclosure must be **ventilated** — never airtight. Keep the breadboard off flammable
  surfaces (curtains).
- No heat-producing parts; ESP32 runs warm but within spec.

---

## 6. Constraints & future ideas (not in initial build)

- No deep sleep (continuous listening + WiFi).
- Single omnidirectional mic — no direction finding.
- Event-log rotation/compaction once it grows large (less pressing now that history + audio also
  live on the VPS, §7).
- Optional later: MQTT/Home Assistant push, SD-card logging, OTA updates, a ventilated 3D case.

---

## 7. Cloud archive (VPS) — `cloud/`

A lightweight web app deployed to the personal k3s VPS that **permanently stores every detection** (event + full-length audio) and presents a public
**event log + graphs + audio playback/download** with token-gated management. This offloads audio
from the ESP32's tiny flash and removes the 5 s clip cap.

### Why

LittleFS is ~896 KB and could keep only ~2 recent 5 s clips (FIFO). Streaming to the VPS instead
saves on-device space and records the whole pass-by. The on-device UI still works standalone (live
status + local `events.csv` history); the VPS site is the durable archive. The VPS **cannot** reach
the ESP32 (home NAT), so the site is history-only — no live status.

### Stack (kept deliberately small)

- **One Node service** (`cloud/server`, Express) serves the React site **and** the API.
- **SQLite** (`better-sqlite3`) for events + **WAV files on disk** — both on a single persistent
  volume (`DATA_DIR=/data`). No separate database container.
- **`cloud/web`**: Vite + React 18 + Chakra v3, **reusing the on-device UI's charts + event table +
  types** (copied) so the graphs match exactly.

### Audio upload (device → VPS)

- Transport: **plain HTTP + shared device token** (`X-Device-Token`), lightest on ESP32 heap.
- **Store-and-forward** (not live streaming — see §2 "Detection clips"): the device captures the
  clip to flash during the event, then **POSTs the finished WAV after the event** (`Content-Length`
  known), with the WS broadcast paused. The server stores the bytes **verbatim** as
  `clips/<epoch>.wav`. Best-effort: a failed upload keeps the clip locally (FIFO-rotated); the event
  row is recorded either way.
- Clip format = whatever the device captured (mono **16 kHz / 16-bit** WAV, ≤5 s). The
  `/api/sim/event` test clip is a synthetic 8 kHz/8-bit two-tone.

### API

| Endpoint                                        | Auth                              | Purpose                                                     |
| ----------------------------------------------- | --------------------------------- | ----------------------------------------------------------- |
| `POST /api/ingest/audio?epoch=`                 | device token                      | live PCM stream → `clips/<epoch>.wav`                       |
| `POST /api/ingest/event`                        | device token                      | event metadata `{epoch,durationS,peakDb,confidence}`        |
| `GET /api/events?limit=&offset=`                | public                            | paginated list (mirrors the device shape)                   |
| `GET /api/stats`                                | public                            | today/total/per-day/per-hour/dB-histogram (SQL aggregation) |
| `GET /api/clip/<epoch>.wav`                     | public **once reviewed**          | serve a clip (HTTP Range → audio seeking)                   |
| `GET /api/events.csv`                           | public                            | CSV export                                                  |
| `GET /api/admin/check`                          | **admin token** (`X-Admin-Token`) | validate the admin token (unlock form)                      |
| `POST /api/events/review?ts=`                   | **admin token** (`X-Admin-Token`) | mark one event reviewed (one-way)                           |
| `DELETE /api/events?ts=` / `DELETE /api/events` | **admin token** (`X-Admin-Token`) | delete one / clear all                                      |

Site access is **public to view; deletes locked** — the browser pastes the admin token once
("Unlock management", kept in `localStorage`) to enable delete/clear.

**Clip privacy:** detection events always appear in the public log, but their **audio stays private
until the admin reviews it**. `GET /api/clip/<epoch>.wav` serves a clip publicly only once its event
is `reviewed`; otherwise it returns **403** unless a valid admin token is supplied (via the
`X-Admin-Token` header, or a `?token=` query param so `<audio>`/download links — which can't set
headers — still work for the admin). The admin reviews by playing the clip (auto-marks reviewed) on
the unlocked Events tab.

### Hardening

Since the site is internet-exposed:

- **Upload cap:** `/api/ingest/audio` discards the partial file and returns **413** past
  `MAX_CLIP_BYTES` (2 MB; real clips are ~160 KB), so a leaked device token can't fill the volume.
- **Rate limit:** `express-rate-limit` caps `/api/*` at **120 req/min per IP** (static assets are
  exempt). `trust proxy = 1` so the limiter sees the real client IP behind Traefik.
- **Headers:** `x-powered-by` off; `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`. No CSP (the inline Matomo snippet would need a
  hash); HSTS belongs at the ingress.
- **robots.txt** + `noindex` meta ask crawlers not to index the site (advisory only).

### Weather (temp + precipitation / siren correlation)

Daily weather for Amsterdam — **mean temperature (°C)** and **total precipitation (mm)** — is fetched
from **[Open-Meteo](https://open-meteo.com/)** (free, no API key) and cached one row per local date in
a `daily_weather` table — **not** copied onto every event, since the correlations are daily.
`cloud/server/src/weather.js` backfills missing days on startup and every 6 h (archive API for past
days, forecast API's `past_days` for the most recent ones). The `/api/insights` `calendar` LEFT JOINs
it as `tempC` + `precipMm`, powering the "Sirens vs. temperature" scatter and the "Sirens vs. weather"
chart (average sirens/day bucketed by Dry / Light rain / Rain). Best-effort: a failed fetch leaves the
value null and the chart just omits that day. Because weather is keyed by date and fetched on demand,
`precip_mm` was added as a nullable column and **backfilled automatically** — a date that has a cached
temp but no precip is treated as not-yet-cached and re-fetched, so no manual DB migration was needed.

### Deploy

Git-push to the k3s remote: `git push deploy main` (remote `deploy@k3s:siren-detector`). Root
**`Dockerfile`** (multi-stage: build `cloud/web` → run `cloud/server`) + **`helm-values.yaml`**
(name, ingress host, 5 Gi PVC at `/data`, `strategy: Recreate`, token secret refs). One-time on
the server: `kubectl create secret generic siren-detector-secrets --from-literal=DEVICE_TOKEN=… --from-literal=ADMIN_TOKEN=…`,
set the real hostname + DNS, and ensure the **ingest path is reachable over plain HTTP** (no forced
443 redirect on that route). Device config (host/port/token) lives in `firmware/include/wifi_credentials.h`.
