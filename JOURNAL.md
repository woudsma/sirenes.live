# Development Journal

Short, dated notes on progress, in chronological order (oldest first).
**Add new entries only at the bottom.**

## 2026-06-02 — Project kickoff & M0 scaffold

### Decisions made
- **Detection:** TinyML via **Edge Impulse** (on-device audio classifier). Fallback if a model
  ever doesn't fit ESP32 RAM: a DSP/FFT two-tone heuristic in `detector.cpp` only.
- **Storage:** **on-device LittleFS only** — no MQTT/Home Assistant, no SD card.
- **Microphone:** **Adafruit ICS-43434** I2S MEMS breakout (digital, calibratable dB).
- **Status LED:** **WS2812** addressable (single data pin, FastLED) — user has one on hand.
- **MCU:** existing ESP32-WROOM-32 DevKit V1 (no PSRAM).
- Toolchain mirrors the `pen-plotter` project: PlatformIO + ESPAsyncWebServer + LittleFS;
  Vite/React 18/TS/Chakra v3 building into `firmware/data/`.

### Feasibility check (Edge Impulse on ESP32)
- Flash 4 MB is fine (binary ~1.3–1.8 MB → use `huge_app.csv`, 3 MB app).
- RAM ~320 KB is the real limit: WiFi+server ~80–120 KB, lean MFE model arena ~30–80 KB → fits.
- Edge Impulse Studio shows ESP32 RAM/flash/latency *before* deploy — verify there first.

### What was built (M0)
- Docs: `SPECIFICATIONS.md` (source of truth), `CLAUDE.md`, `README.md`, this journal.
- Firmware skeleton that compiles: WiFi STA+AP fallback, mDNS `siren-detector.local`, NTP,
  LittleFS, WS2812 status LED, AsyncWebServer with full REST + WebSocket API, LittleFS CSV
  event log with per-day/hour/dB aggregation.
  - `audio.cpp`: **simulated** ambient dB for now (real I2S in M1).
  - `detector.cpp`: **stub** classifier (always score 0) + real event state machine; a
    `POST /api/sim/event` injects synthetic events for end-to-end testing without a mic.
- UI: Vite/React/TS/Chakra v3 with Dashboard (dB meter, status, today's count), graphs
  (per-day bar, time-of-day, loudness), event list, settings. Uses a bundled mock dataset when
  not connected to a device so charts are designable offline; "Simulate detection" button hits
  the device sim endpoint.

### Verified
- `pio run` compiles clean: **RAM 15.7%** (51 KB / 320 KB), **Flash 31.2%** (980 KB / 3 MB
  huge_app) — lots of headroom for the Edge Impulse model later.
- `npm run build` clean: `firmware/data/app.js.gz` ≈ **240 KB** gzipped (fits LittleFS easily).
- Note: `@chakra-ui/charts` 3.35 requires **recharts v3** (not v2) — pinned `recharts@^3.1.0`.
- Gotcha: recharts v3 charts did **not** auto-size inside Chakra's `Chart.Root` (which only
  sets `aspectRatio`+`width:100%`) → blank charts. Fix: wrap each chart in recharts
  `<ResponsiveContainer width="100%" height={240}>` and set `Chart.Root aspectRatio="auto"`.
- Polish: bar-chart hover cursor `chart.color('bg.muted')` resolved to black — replaced with a
  translucent gray. Added consistent `YAxis width`/margins so the chart plot areas line up.
- Demo simulate skips the network call when no device is connected (avoids a console 404), and
  the REST poll only recurs once a device is connected.
- Demo mode: the "Simulate detection" button now injects a local mock event when no device is
  connected (`addLocalEvent` in `useDevice.ts`), so the dashboard updates offline too.
- Dev server pinned to **port 3000** (`strictPort`) in `vite.config.ts`.

### Added — per-detection audio clips (playback)
- Decision: save a short **MP3 (~24 kbps mono)** per detection — smallest that plays natively in
  the browser. Budget **500 KB FIFO** on the existing huge_app partition (stats stay forever,
  audio rotates → ~20 most recent clips). ~1.5 s pre-roll, 12 s cap.
- Firmware: new `clips.cpp` (real file mgmt + FIFO rotation + budget), `events.csv` gains a
  `clip` column, detector opens/writes/closes a clip across the event state machine,
  `GET /api/clip?f=` serves it. The MP3 **encoder is deferred to M3** (needs real audio); the
  `clips_write()` stub writes nothing and empty clips are discarded for now.
- UI: Play/Pause button column in the event table; offline demo synthesizes a two-tone WAV so the
  button works without a device. Firmware still compiles small (RAM 17.2%, Flash 31.3%).

### Next steps
- Order/receive the Adafruit ICS-43434; wire per `SPECIFICATIONS.md` GPIO table.
- M3: vendor the Shine MP3 encoder into `firmware/lib/`, implement `clips_write()` encoding +
  the pre-roll ring buffer, and verify CPU coexists with Edge Impulse inference.
- M1: implement real I2S read in `audio.cpp`, print dB on serial, calibrate `CAL_OFFSET_DB`
  against a phone SPL-meter app.

### Notes / to confirm on real hardware
- WS2812 supply 3V3 vs 5V (start on 3V3 for one pixel).
- Exact arduino-esp32 core version PlatformIO resolves — affects the I2S API used in M1
  (legacy `driver/i2s.h` vs new `driver/i2s_std.h`). Decide when the mic is in hand.

## 2026-06-02 — First hardware flash (ESP32 on the bench)

- Connected the ESP32-WROOM DevKit over USB (`/dev/cu.usbserial-0001`) and flashed for real:
  firmware upload (~990 KB) + filesystem upload (`uploadfs` auto-built the UI, ~248 KB).
- Set real WiFi creds in `firmware/include/wifi_credentials.h` (gitignored). Device joined in STA
  mode and the web UI is reachable at **http://siren-detector.local** — confirmed in a browser.
- Added: onboard LED (GPIO2) blinks **10× on boot** in `leds_startup_blink()` (also pulses the
  WS2812 white).
- State on device: live dB is still the *simulated* ambient (mic not wired), event log starts
  empty, "Simulate detection" now hits the real device. No audio clips yet (encoder is M3).
- Serial note: `pio device monitor` can't run from this non-interactive shell (needs a TTY); use
  it directly in a terminal, or read the port with pyserial when boot logs are needed.
- Mic arrived (Adafruit ICS-43434). Reassigned the I2S pins to the breadboard's **bottom row**
  so the board sits flush: BCLK **GPIO16 (RX2)**, WS **GPIO17 (TX2)**, DATA **GPIO18 (D18)** —
  avoids the USB UART (1/3) and strapping pins (2/5/15). WS2812 stays on D4; both powered from
  the bottom 3V3/GND rails. No top-side pins needed. (`pins.h`; compiles, not yet reflashed.)
- **Next:** M1 — replace the simulated dB in `audio.cpp` with real I2S read + calibration, then
  flash (carries the new pin map).

## 2026-06-02 — M1: mic bring-up (I2S working)

- Implemented real I2S capture in `audio.cpp` (legacy `driver/i2s.h`, core 2.0.16): 32-bit
  slots, DC-removal, RMS → dB SPL with `FULL_SCALE = 2^31` and `+(94 − sensitivity)=120 dB`.
- **Bug hit:** dB pinned at the 30 dB floor; serial showed I2S clocking (4096 B/read) but every
  sample exactly 0. Read both slots in `RIGHT_LEFT` stereo → data was present on the *left/even*
  slot while `ONLY_LEFT` returned zeros. Classic ESP32 legacy-I2S inversion. **Fix:** use
  **`I2S_CHANNEL_FMT_ONLY_RIGHT`** (documented in SPECIFICATIONS). dB now tracks sound
  (~50–65 dB ambient/talking, real bipolar samples). Cleaned debug, reflashed.
- Mid-debug the USB serial port dropped once (re-seat fixed it); unrelated to wiring.
- Serial reads done via a small pyserial script (`pio device monitor` needs a TTY, can't run
  from the non-interactive shell).
- **Next:** calibrate `CAL_OFFSET_DB` in Settings vs a phone SPL app; then M2 (data collection).

## 2026-06-02 — M2: data collection (record WAV)

- dB calibration done by user.
- Added a **Record** tab + firmware recorder (`record.cpp`): captures mono 16 kHz/16-bit WAV to
  `/rec.wav` (mutex-guarded; audio task feeds it), auto-stops at 15 s, downloads as `<label>.wav`.
  API: `/api/record/{start,stop,status,download}`.
- Verified on-device end-to-end: recorded 3 s → `/rec.wav` is a valid 102 KB WAV (PCM mono 16-bit
  16 kHz, real signal), download returns it. (Note: the download route is GET-only — a `curl -I`
  HEAD probe 404s; browsers use GET so it's fine.)
- **Next:** record a labeled dataset at the window (siren / traffic / quiet), then M3 — train in
  Edge Impulse, export the Arduino lib to `firmware/lib/`, wire `run_classifier_continuous` +
  the Shine MP3 clip encoder.

### M2 follow-up — recording crashes (two bugs, both fixed)
Reported: WebUI froze + ESP32 rebooted on **stop** for 9–11 s clips; 6 s worked. Debugged by
reproducing over the network while capturing serial (pyserial; the board's USB-serial port also
dropped on reboot a couple of times — re-seat). Two distinct crashes, decoded with addr2line:
1. **Task watchdog on `async_tcp`** — `record_stop`/finalize did blocking LittleFS I/O *inside*
   the AsyncWebServer handler; large-file flush/close + mutex contention blocked the single async
   task past 5 s → reboot. **Fix:** made recording flag-driven — handlers only set
   `req_start`/`req_stop`; ALL file I/O moved to `record_feed()` on the audio task. Removed the
   mutex.
2. **`IntegerDivideByZero` in `lfs_alloc`** (LittleFS) during the write — a single growing file
   exhausts the allocator well below raw free space (~480 KB failed with `total=917504
   used=270336 free=647168`). LittleFS divides-by-zero when full instead of erroring. **Fix:**
   capped `REC_MAX_SECONDS` to **6 s** (192 KB), plus a free-space backstop in `record_start`.
Verified: fresh FS, 6 s record → valid 192 KB WAV downloaded (HTTP 200), no reboot.

## 2026-06-03 — M3: Edge Impulse model integrated

- Trained a 2-class (siren/traffic) classifier in EI Studio; exported the Arduino library to
  `firmware/lib/woudsma-project-1_inferencing/` (1 s window @ 16 kHz, 4 slices/window, int8).
- Wired `detector.cpp`: `classify()` now feeds 250 ms slices into `run_classifier_continuous`
  (rolling 1 s MFCC window) and returns the "siren" probability into the existing ON/OFF state
  machine. Siren class index resolved from labels at init (not assumed). int16→float is a plain
  cast, matching EI's `int16_to_float` on the training data + the same `AUDIO_PCM_SHIFT=11` gain.
- Bumped the audio FreeRTOS task stack 8 KB → 32 KB for the EI DSP/inference.
- Builds: RAM 25%, flash 34.5% of the 3 MB app partition. On-device init OK
  (`Edge Impulse ready: 2 labels, siren=index 0, slice=4000 samples`), stable, ~2 Hz status log.
- **Quiet-room check:** ambient 47–56 dB → siren score 0.00, no false positives — even though the
  model has no `quiet` class. Added the live siren score to the 2 Hz serial line for bring-up.
- **Caveat:** training showed 100% val accuracy (small single-session dataset → likely overfit).
  Real-world performance unverified until a siren is played at the mic.
- **TODO:** play a real Dutch two-tone/yelp siren at the mic, confirm score crosses
  `DETECT_SCORE_ON` (0.70) for `DETECT_MIN_MS` (1.5 s) → event logs; tune thresholds; decide
  whether to add a `quiet` class or gate detection on dB SPL.
- **Update (v1.0.2):** retrained to 3 classes `{cat, siren, traffic}` (siren now label index 1).
  No firmware change needed — `detector_init()` resolves the siren index by label string. Builds
  identical footprint (RAM 25% / flash 34.5%); quiet-room siren score ~0.02–0.05, stable 2 Hz.
  UI: added a thin vertical siren-score meter (percent only) beside the dB meter in DbMeter.tsx.

## 2026-06-03 — Events delete, WAV clips, settings persistence

- **Delete events:** added `events_delete(epoch)` (rewrites the CSV minus matching rows,
  drops the linked clip) and `events_clear()` (wipes log + all clips) in events.cpp; new
  `DELETE /api/events?ts=` / `DELETE /api/events` endpoints. UI: per-row trash button +
  "Clear all" (with confirm) in EventTable, wired through useDevice (`deleteEvent`/`clearEvents`,
  optimistic local update). Verified on-device: delete-one, 404 on bad ts, clear-all.
- **Clips now record for real:** the MP3 encoder was a no-op stub, so every clip was 0 bytes and
  got dropped → events showed `—`. Rewrote clips.cpp to write mono 16-bit **WAV** (same proven
  path as record.cpp), added `clips_remove()`/`clips_clear()`. `/api/clip` now serves `audio/wav`.
  Sized for the 896 KB LittleFS: CLIP_MAX_SECONDS 12→5, budget 500→480 KB ⇒ ~3 recent clips kept.
  Needs a real siren to confirm playback (room siren score ≈ 0).
- **Settings persistence:** already correct — `/settings.json` on LittleFS survives reboots
  (verified: POST cal=3.5 → serial reset → still 3.5). Earlier resets were our `uploadfs` wiping
  LittleFS; per user, reflash-reset is acceptable, so no NVS migration.

## 2026-06-04 — Fix LittleFS-exhaustion reboots (record + clip save)

- **Symptom:** board rebooted sometimes when recording on the Record tab, and after a detection
  finished saving its clip. Both are WAV writes to LittleFS.
- **Root cause:** storage budgets didn't fit the ~896 KB partition. UI (248 KB) + clips budget
  (480 KB) + `rec.wav` (192 KB @ 6 s) ≈ 920 KB > 896 KB. And the clips FIFO only rotated *after*
  a clip was fully written (`enforce_budget()` in `clips_end()`), with no free-space check in
  `clips_write()` — so a new clip could run LittleFS dry mid-write → `lfs_alloc` divide-by-zero
  → reboot.
- **Fixes:** `REC_MAX_SECONDS` 6→5 (≈160 KB); `CLIPS_MAX_BYTES` 480→320 KB (~2 clips) so
  UI+clips+rec all fit with margin. `clips_begin()` now pre-rotates (`enforce_budget(headroom)`)
  and re-checks free space *before* writing, skipping the clip instead of crashing when tight.
  Record tab maxSeconds now follows the device value. Firmware + UI build clean. Needs on-device
  confirmation: record several clips back-to-back + trigger a detection, watch for no reboot.

## 2026-06-04 — Fix reboot when downloading a recorded WAV

- **Symptom:** recording a training clip then pressing Download often crashed/rebooted the ESP32.
- **Root cause (from panic backtrace + addr2line):** heap exhaustion. Free heap is only ~70 KB
  with the EI model resident; streaming the 160 KB WAV drives it to near-zero (serial showed a
  flood of `Failed to run DSP process (-1002)` = `EIDSP_OUT_OF_MEM`). The unguarded **5 Hz WS
  status broadcast** (`ws.textAll()` in webserver.cpp) then does `operator new` for the message
  buffer, which throws `bad_alloc` → `std::terminate` → reboot. A slow/stalled WS client made it
  worse: the per-client queue backed up (`Too many messages queued`) until the alloc died.
- **Fix (layered, in webserver.cpp + main.cpp):**
  1. Serve the download as a **chunked response** so EOF (filler returns 0) is detectable.
  2. **Pause the WS broadcast** while a download streams + a 1.2 s cool-down after, with a 20 s
     backstop + `onDisconnect` so a dropped download can't pause it forever.
  3. Skip the push when a client's queue is backed up (`ws.availableForWriteAll()`) — kills the
     "Too many messages"/queue-buildup path.
  4. **Wrap `ws.textAll()` in try/catch** (the platform builds with `-fexceptions`). This is the
     guarantee: heuristics can't win the alloc race (another task grabs heap between the check and
     the `new`), but a caught `bad_alloc` just drops one status frame instead of rebooting.
- **Verified on hardware:** pathological stress test (deliberately slow WS client + 20 rapid
  record→download cycles) went from 16/17 with a reboot → **20/20, 0 reboots, 0 aborts, 0 queue
  overflows, 0 download timeouts**. Investigated with serial capture + xtensa addr2line backtraces.

## 2026-06-04 — Cloud archive: stream detection audio + events to the VPS

- **Goal:** stop storing detection audio on the ESP32 (LittleFS kept only ~2 recent 5 s clips) —
  stream it to the VPS instead and keep **every** recording, full-length, plus a durable event DB.
- **New app `cloud/`** deployed to the k3s VPS via `git push deploy main`: one Node/Express
  service serving a React (Vite + Chakra v3) **event-log + graphs + audio playback** site and the
  API, with **SQLite + WAV files on one PVC** (`DATA_DIR=/data`). Reuses the on-device UI's charts
  + event table + types so the graphs match. Root `Dockerfile` + `helm-values.yaml` added.
  - Site is **public to view, deletes locked** behind an admin token (`X-Admin-Token`,
    "Unlock management"). Ingest is gated by a device token (`X-Device-Token`).
- **Firmware `cloud.cpp`** (new core-1 task): on detection, opens a chunked HTTP POST and streams
  **8 kHz / 8-bit PCM** (~8 KB/s) from a RAM ring buffer (`cloud_clip_begin/write/end`), then posts
  the event JSON. **Plain HTTP + token** (lightest on heap, per decision). Server prepends the WAV
  header and patches its size on stream close, so length need not be known up front. Best-effort:
  on WiFi-down / busy / dropped stream the clip is skipped but the event is still in local
  `events.csv` (and pushed when reachable). Detector now calls `cloud_clip_*` instead of `clips_*`,
  **freeing the 320 KB on-device clip budget**.
  - Heap-aware: ring buffer kept to **8 KB** (free heap is only ~70 KB with the EI model resident).
  - `/api/sim/event` extended (`cloud_test_clip`) to synthesize a two-tone clip + push it, so the
    full ingest path can be exercised on demand without waiting for a live siren.
- **Record tab unchanged** except it now **deletes `/rec.wav` after download** (`record_request_delete()`,
  run on the audio task), in addition to the existing free-on-new-recording.
- **Verified:** cloud server round-trips locally (curl: token auth, audio→WAV ingest, event link,
  stats/Range/delete). `cloud/web` builds clean. **Firmware builds clean** (RAM 25%, Flash 35%).
  **Deployed to the VPS** at `sirenes.live`. Project is at **M3** (real mic + model),
  so the real-audio detection path feeds the stream directly. Set `CLOUD_HOST`/token in
  `wifi_credentials.h` and flash; confirm a real detection lands a clip + event on the site.

## 2026-06-04 — Cloud audio: live streaming → store-and-forward (heap wall)

- **Symptom:** after the **first** detection uploaded, detection stopped — the score froze (~1%)
  and serial flooded `Failed to run DSP process (-1002)` (`EIDSP_OUT_OF_MEM`) + `EI classify
  error: -5`. The Edge Impulse DSP couldn't allocate.
- **Root cause:** the same ~70 KB free-heap wall the record-download path hit. Streaming the clip
  **live over WiFi during the detection** held/fragmented heap while the EI DSP needed a contiguous
  block every 250 ms → DSP OOM → frozen classifier → event couldn't end → stream stayed open →
  permanent. Live WiFi + EI DSP simultaneously is not viable on this board (no PSRAM).
- **Fix — store-and-forward** (the pre-agreed fallback): capture the clip to LittleFS via the
  existing `clips.cpp` **during** the event (5 s, 16 kHz/16-bit), then upload the finished WAV +
  event **after** the event ends, with the WS broadcast paused (`webserver_pause_ws()`, same as the
  download path). WiFi is off the detection critical path, so the DSP keeps its heap and detection
  stays live. On a successful upload the local clip is deleted on core 0 (`clips_request_remove()` →
  `clips_service()` in the audio loop); failed uploads stay and the FIFO rotates them.
- **Server:** `/api/ingest/audio` now stores the posted WAV **verbatim** (device sends a complete
  file, not raw PCM) + logs each ingest. Needs a redeploy (`git push deploy main`).
- **Trade:** clips are capped at 5 s (LittleFS ceiling) instead of full-length — accepted.
- **Verified:** firmware builds clean (RAM 25%, Flash 35%). Flashing + on-hardware retest next:
  trigger a detection, confirm it keeps detecting (no `-1002` flood) and the clip+event land on the
  site. Earlier streaming entry above is superseded.

## 2026-06-10 — Crash hunt: EI heap pool, net watchdog, LittleFS CoW fix, two-stage LED

Tracked down and fixed the reboots-during-listening. Turned out to be **three distinct failure
modes**, all reproduced live on the device and fixed structurally:

1. **DSP heap starvation → deliberate reboot (the reported crash).** The EI DSP allocates
   ~20–30 KB of MFCC/FFT scratch from the system heap on every 250 ms slice; a web-UI cold load
   (~248 KB bundle + parallel API calls) drained/fragmented it → `-1002` flood → recovery ladder
   → `ESP.restart()`. Reproduced on demand with 5 parallel curl loads. **Fix:** dedicated EI heap
   (`ei_pool.cpp`): strong overrides of the SDK's weak `ei_malloc/ei_calloc/ei_free` over a 40 KB
   `multi_heap` pool, carved from the heap at boot (a static BSS array overflows dram0). Measured
   peak use ~34 KB, fallback counter 0 through every stress test, **zero -1002 all day**. Offset
   the reservation by trimming the audio task stack 32 K → 12 K (measured high-water: 2.3 K used).
   Linkage gotcha: the overrides must NOT be `extern "C"` (EI_C_LINKAGE is unset, symbols are
   C++-mangled) — verified with `nm` + the new 10 s `EIpool free/low/fb` serial diagnostic.
2. **TCP/IP stack wedge (new finding, previously masked by the reboots).** Under the parallel-
   load barrage the lwIP/AsyncTCP stack can wedge permanently: WiFi stays associated but ARP/
   ICMP/TCP all dead. Tried modem-sleep off (kept: large transfers stalled less, ~0.4 W extra)
   but it isn't the root cause. **Fix: network watchdog** (`net_watchdog.cpp`): persistent
   esp_ping session to the gateway every 15 s; 60 s silent → WiFi reconnect, 150 s → controlled
   reboot, never during a detection, stand-down in AP mode or when WiFi itself reports down
   (auto-reconnect owns that; no reboot loops during router outages). Also: WS broadcast 5 Hz →
   2 Hz, WS clients capped at 2 (`cleanupClients(2)`), UI bundle revalidates with **304s** (ETag
   from gzip CRC + `Cache-Control: no-cache` + build-time Last-Modified) so browsers stop
   re-downloading 248 KB per load. Realistic browser traffic (cold load + 10 revalidating
   reloads): 100% clean. Pathological barrage: still wedges occasionally → watchdog recovers in
   ≤ ~2.5 min; detection unaffected throughout (EI pool isolation).
3. **LittleFS `lfs_alloc` IntegerDivideByZero on recording finalize (caught live, decoded with
   addr2line).** Root cause of the long-standing M2 mystery: the WAV header backfill
   (`seek(0); write; close`) makes LittleFS **copy-on-write the whole file** (CTZ skip-list) —
   a 160 KB file transiently needs another ~160 KB free. With the clips FIFO full (uploads had
   failed during the wedge tests) the close div-zeroed and rebooted. Explains "480 KB failed
   with 632 KB free" and the old 9–11 s record crashes. **Fix:** recordings (`/rec.pcm`) and
   clips (`<epoch>.pcm`) are now **raw PCM**; the 44-byte header is prepended on the fly at
   download (`/api/record/download`), playback (`/api/clip`) and VPS upload (`wav_format.h`).
   No in-place rewrite → failure class gone. Legacy `.wav` clips are purged once at boot.
   Verified: record→download = valid WAV; forced a real detection (thresholds lowered live via
   `/api/config`) → clip+event on the VPS, valid WAV, HTTP 200.
- **Two-stage LED + clip window (the responsiveness wishes):** new fast LED signal in the
  detector (score ≥ ON sustained 0.5 s), decoupled from event counting: **dim blue pulse** =
  siren-like (candidate), **bright blue flash** only once the event is confirmed at 5 s (i.e.
  it WILL be logged — per decision), back to green within ~250 ms of the score dropping while
  the event closes via the normal 3 s hang. Clip capture now starts **2 s after the event
  opens** (`CLIP_START_DELAY_MS`) → covers ~seconds 7–12 of the pass-by instead of 5–10;
  verified by timing (4.35 s clip on a 6.3 s window). Guard: event ending inside the delay logs
  clip-less instead of referencing the previous clip.
- **Next:** overnight soak with the UI open (watch `EIpool fb=0`, no `-1002`, no unexplained
  NetWD reboots), then observe LED stages + clip content on the next real siren. Note: one
  unexplained `POWERON_RESET` at 19:21 during testing (not a panic — possibly power/EN glitch);
  keep an eye out during the soak.

- **Added** a user-facing detection on/off toggle in the on-device web UI (StatusCard Pause/Resume
  button). New `POST /api/detect?on=true|false` flips a dedicated `g_user_paused` flag in the
  detector — kept **separate** from the existing `g_paused` (cloud-upload heap pause) so the two
  don't clobber each other. While paused, `classify()` returns 0 so no events open; an in-progress
  event ends cleanly via the normal hang timeout.
- Status JSON gains `paused`; new `LED_PAUSED` amber breathe shows it on the device. Setter only
  flips the volatile flag (no cross-task writes to slice state) → race-free, like the sim-event flag.
- **Verified:** firmware builds clean (RAM 27.6%, Flash 35.3%); on-device UI + cloud builds pass.
  On-hardware check next: toggle from the UI, confirm score drops to 0, LED goes amber, and
  detection resumes on un-pause.

## 2026-06-14 — Public launch: sirenes.live (rebrand, hardening, info content)

Cloud archive is now live and internet-exposed at **sirenes.live** (public to view, deletes
locked). Today was making it presentable and safe to leave open — no firmware.

- **Rebrand → sirenes.live:** site title, manifest, server logs, README. README leads with the
  live link; dropped the M-status section.
- **Server hardening:** `express-rate-limit` (**120 req/min per IP** on `/api/*`, static exempt)
  + `trust proxy = 1` so it sees the real IP behind Traefik. Upload cap on `/api/ingest/audio`
  (aborts + 413 past **2 MB**; real clips ~160 KB) so a leaked device token can't fill the
  volume. Security headers (`nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`), no CSP/HSTS
  (ingress's job). New **Hardening** section in `SPECIFICATIONS.md`.
- **Crawler hygiene:** `robots.txt` + `noindex` meta (advisory only).
- **Info tab:** added **Why**, reworked **How accurate** (now also caveats loudness as an
  uncalibrated relative measure), **GitHub** link, and a **Contact** card with a base64/runtime
  obfuscated email so the address isn't in the static bundle.
- **ManageBar:** admin unlock collapsed to a ghost lock icon (expands on click). Cosmetic only —
  the token is still verified server-side.
- **Verified:** `cloud/web` build passes.

## 2026-06-29 — Cloud: downtime registration (no-data periods)

- Admin can record outages (e.g. a thunderstorm unplug) so they don't masquerade as quiet stretches
  or skew the averages. New `downtime` table + admin-gated `POST/DELETE /api/downtime`; the list
  rides along in public `/api/insights`.
- Stats are downtime-aware: the longest-quiet-streak can't span/count an outage, and the per-day/
  per-night/"a siren every" averages drop any day with downtime. Counts, totals, calendar and
  `/api/stats` unchanged.
- Web: admin-only collapsible **Downtime periods** panel + **Add downtime** (native datetime
  pickers). Heatmap greys empty cells overlapping an outage ("No data" + reason tooltip); the year
  calendar only greys days inside a **>24 h** outage. Bilingual EN/NL.
- **Verified:** lint/format/build clean; smoke-tested the endpoints. Not yet committed/deployed.
