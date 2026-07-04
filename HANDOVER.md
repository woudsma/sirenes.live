# Handover — XIAO ESP32S3 port + siren-detection quality bug

**Date:** 2026-07-04 · **Branch:** `seeed-esp32`

Rule: **never run git commit/push** — the user does all commits. Keep comments/docs compact.

## Task
Port the firmware from a classic ESP32-WROOM-32 DevKit to a **Seeed Studio XIAO ESP32S3**
(ESP32-S3R8, 8 MB flash + 8 MB PSRAM, native USB-C). Mic/WiFi/LED must work as before, and
siren detection must be as reliable as it was on the old board.

## Working on hardware ✅
- Board builds + flashes (native USB `/dev/cu.usbmodem101`, `--no-stub` @ 115200). PSRAM enabled.
- WiFi works **only with the external antenna attached** (XIAO has no PCB antenna). IP: 192.168.2.25.
- LED OK (WS2812/APA106 color order correct; onboard user LED = GPIO21, active-LOW).
- Mic OK: I2S channel flipped **`ONLY_RIGHT` → `ONLY_LEFT`** (`audio.cpp`) — S3 lacks the classic
  ESP32 slot inversion. dB tracks sound; audio capture is clean and plays back fine.
- mDNS hostname = **`siren-detector`** (`config.h`).
- UI served at `http://siren-detector.local`. Status broadcast at 5 Hz (`main.cpp`).
- Pins (XIAO pads): I2S BCLK/WS/DATA = GPIO8/7/44 (D9/D8/D7); WS2812 = GPIO1 (D0); mic 3V3, LED 5V.
- ESP-DSP FFT (aes3, S3-optimized) confirmed compiled + linked; DSP ~17 ms, classify ~4 ms per slice.

## Prior red herring (resolved)
Earlier the device scored `siren≈0.00` on everything. Cause: the board was **still flashed with an
old kissfft diagnostic build** (which dropped I2S samples) while the source had already been reverted
to the fast ESP-DSP config. A clean **rebuild + flash** synced the device to source and restored
inference. The `~/Downloads/siren_device_capture.wav` clip classifies as **siren** in Edge Impulse
Studio, confirming the model + audio content are fundamentally OK.

## RESOLVED (2026-07-04): root cause was memory alignment, not the model
The oscillation was garbage DSP output, not weak discrimination. On the S3 the EI DSP runs the
ESP-DSP **aes3** FFT (`dsps_fft2r_fc32_aes3_`), whose `ee.ldf/stf.64` PIE loads **silently mask
the low address bits** on misaligned pointers. Its scratch buffer comes from `ei_malloc`
(ei_pool.cpp `multi_heap`), which only guarantees 4-byte alignment → under-aligned buffer →
garbage spectrum → confident wrong class, flipping with pool layout. The old board's ae32 FFT
uses 32-bit loads (4-byte alignment OK), which is why the same model worked there for weeks.
Proof: instrumented `ei_malloc` counted ~3300 under-aligned allocs/min live. Fix: `ei_malloc` now
uses `multi_heap_aligned_alloc(…, 16)` (fallback `heap_caps_aligned_alloc`); `EI_POOL_BYTES`
40 → 44 KB for the padding. Verified: training-clip playback → sustained `siren:1.00`, event
logged (9 s, conf 1.00), stable ambient scores. **No retrain needed.** Original report below.

## ~~OPEN BUG~~: detection quality is poor — events almost never fire
Playing a siren, the model **oscillates between `cat:1.00` and `siren:1.00`** roughly every other
250 ms slice on the *same* audio. Because the score keeps dropping below threshold, it never holds
above `DETECT_SCORE_ON` (0.80) for the `DETECT_MIN_MS` (5 s) needed to open an event — so **no event
is logged and the LED rarely pulses**.

Honest measured stats during a normal siren playback (`siren=` printed ~1 Hz):
`siren > 0.8: 0%`, `median 0.01`, `86% of slices < 0.5`. (Individual slices *do* hit `siren=1.00`,
but they alternate with `cat=1.00`, so the run never sustains.)

### Diagnosis
This is primarily a **model discrimination problem between `cat` and `siren`**, not an audio-path
bug. The training set is tiny (5 siren clips) and the `cat` class (frequency sweeps of a meow) is
acoustically close to the two-tone siren, giving a weak decision boundary that tips back and forth
slice-to-slice.

Secondary (real, but not the whole story): the ICS-43434 on this build picks up strong **broadband
low-frequency mechanical rumble** that grows with playback level. A loud on-device capture measured
**72% of energy below 100 Hz** (and ~58% in 100–300 Hz), vs the training siren clips which sit mostly
in **600–2500 Hz** (~68% there). This rumble smears the MFE features.

### Ruled out (by measurement)
- **Not clipping**: `clip=0/1024` always; PCM peaks ~1000–4300 « 32767 full scale.
- **Sample rate**: measured 16000/s (correct) at baseline. (Drops to ~13–15 k/s *only* during a
  cloud upload — a separate concern, see below.)
- **DSP timing / FFT**: ESP-DSP aes3 path, ~17 ms dsp + 4 ms classify, well under the 250 ms budget.
- **Audio content**: recorded clips are clean and classify as `siren` in Studio.

## Fixes applied this session (`firmware/src/audio.cpp`, `firmware/include/config.h`)
These are correct and should stay, but they only **partially** help — the core cat/siren confusion
remains.
1. **DC removal on the classifier/recording PCM.** The PCM path now subtracts the per-frame integer
   mean (`imean`) before the `>> AUDIO_PCM_SHIFT`. The dB path always did this; the classifier path
   did not. Recorded clips now measure DC ≈ 0 (matching the ~0-DC training clips; was ±180k raw).
2. **4th-order high-pass filter @ 300 Hz** (`AUDIO_HPF_HZ`, two cascaded biquads Q=0.707) on the same
   PCM. Removes sub-300 Hz rumble; on a loud capture it restored the siren band (17% → ~75% of
   energy in 600–2500 Hz). The Dutch two-tone fundamental (~600–800 Hz) is untouched.
   Because recordings share this path, **new training clips recorded now are already HPF-filtered**,
   so retraining on them keeps train/inference consistent.

## LIKELY REAL FIX (next agent) — retrain the model
The firmware now feeds the model clean, DC-free, rumble-filtered audio at the right rate. The
remaining failure is the model itself. Recommended:
- **Collect more, representative `siren` clips through THIS S3 mic** (Record tab → `/api/record`),
  including the actual test playback, plus more `cat`/`noise`/`traffic` negatives.
- Retrain in Edge Impulse; consider applying the same 300 Hz HPF in the DSP block (or just rely on
  the fact that on-device recordings are now HPF-filtered, so training data matches inference).
- Re-export the Arduino library to `firmware/lib/` and re-test.

### Firmware-only mitigations (band-aids, if not retraining yet)
- Smooth the siren score over N slices in `detector.cpp` before the state machine, or lower
  `DETECT_SCORE_ON` / `DETECT_SCORE_OFF` — makes events tolerate the slice-to-slice dips. These mask
  the weak decision boundary rather than fixing it.

## Temporary debug still in the tree (remove once resolved)
- `firmware/src/audio.cpp` — per-frame `rawPk / pcmPk / clip / dc` diagnostic print and the
  "audio rate" samples/s print (both gated by `SERIAL_AUDIO_MONITOR`).
- `firmware/src/detector.cpp` — "EI timing" per-slice print (gated by `SERIAL_AUDIO_MONITOR`).
- `firmware/include/config.h` — `SERIAL_AUDIO_MONITOR = true` (left on for debug).

## Also still pending (unrelated to the detection quality bug)
- **Sample drop during cloud upload**: `audio rate` falls to ~13–15 k/s while the cloud task uploads
  a clip + posts the event (see `cloud.cpp` `detector_pause` / `detector_reinit`). Corrupts the
  rolling window around an event. Only matters once events fire reliably again.
- **dB SPL calibration** on the new board (`CAL_OFFSET_DB` in `config.h`, currently -2.0).
- Revert `MDNS_HOSTNAME` to `siren-detector` when the old board is retired.

## Reading the device (no TTY monitor in non-interactive shell)
Use pyserial via `~/.platformio/penv/bin/python` with `dtr=False` so it doesn't reset the board.
Record + download a clip over HTTP (device at 192.168.2.25 or `siren-detector.local`):
`curl -X POST "http://192.168.2.25/api/record/start?label=x"` → wait ~5 s (5 s cap) →
`curl "http://192.168.2.25/api/record/download" -o clip.wav`.

Build / flash:
```
cd firmware
~/.platformio/penv/bin/pio run -e seeed_xiao_esp32s3                                   # build
~/.platformio/penv/bin/pio run -e seeed_xiao_esp32s3 -t upload --upload-port /dev/cu.usbmodem101
```
