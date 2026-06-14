#pragma once
#include <Arduino.h>

// ===========================================================================
// Siren Detector — tunable configuration. See SPECIFICATIONS.md.
// ===========================================================================

#define FW_VERSION "0.1.0"

// --- Network ---
constexpr char     MDNS_HOSTNAME[] = "siren-detector"; // -> http://siren-detector.local
constexpr char     AP_SSID[]       = "SirenDetector";  // fallback AP if WiFi fails
constexpr char     AP_PASS[]       = "sirenpass";      // >= 8 chars
constexpr uint32_t STA_TIMEOUT_MS  = 12000;
// NTP / timezone (Europe/Amsterdam, CET/CEST with DST rules)
constexpr char     NTP_SERVER_1[]  = "pool.ntp.org";
constexpr char     NTP_SERVER_2[]  = "time.google.com";
constexpr char     TZ_INFO[]       = "CET-1CEST,M3.5.0,M10.5.0/3";

// The 5 Hz WebSocket status push is paused while a large file download streams
// (GET /api/record/download sends a ~160 KB WAV) and for a short cool-down after,
// so its message-buffer allocations don't compete with the download for a heap
// that's run to the edge. A failed alloc in ws.textAll() is also caught (see
// webserver.cpp) so it can never abort the board. This is how long to stay
// paused after a download completes, letting the heap + TCP buffers recover.
constexpr uint32_t WS_DOWNLOAD_COOLDOWN_MS = 1200;

// --- Audio / I2S ---
constexpr uint32_t SAMPLE_RATE_HZ  = 16000; // Edge Impulse audio default
constexpr size_t   AUDIO_FRAME     = 1024;  // samples processed per chunk

// Print the ~2 Hz "dB SPL | cat/siren/traffic" line to serial. Useful for dB
// calibration (M1) and model bring-up (M3); set true when you need it. Off by
// default so the serial log stays quiet in normal operation.
constexpr bool SERIAL_AUDIO_MONITOR = false;

// --- dB SPL calibration (Adafruit ICS-43434) ---
// dB_SPL ~= 20*log10(rms / FULL_SCALE) + (94 - MIC_SENSITIVITY_DBFS) + CAL_OFFSET_DB
constexpr float MIC_SENSITIVITY_DBFS = -26.0f; // datasheet: -26 dBFS @ 94 dB SPL @ 1 kHz
constexpr float DB_FULL_SCALE        = 32768.0f; // 16-bit full scale
constexpr float CAL_OFFSET_DB        = -2.0f;  // tune in M1 against a phone SPL meter
constexpr float DB_FLOOR             = 30.0f;  // clamp floor when silent / no mic

// Digital gain when packing the mic's 24-bit sample (left-justified in a 32-bit
// I2S frame) into 16-bit PCM for recordings AND the classifier. Output = raw >>
// shift, clamped. Smaller shift = louder. 16 ≈ no gain (very quiet); 13 ≈ +18 dB
// and clips only above ~102 dB SPL; 11 ≈ +30 dB and clips above ~90 dB SPL. The
// SAME gain applies to training clips and live inference, so they stay consistent.
// Does NOT affect dB SPL (computed from the raw sample). Tune by ear.
constexpr int AUDIO_PCM_SHIFT        = 11;

// --- Detection (Edge Impulse, wired in M3) ---
// A siren event opens when the classifier score stays above ON for MIN_MS, and
// closes after the score drops below OFF for HANG_MS.
constexpr float    DETECT_SCORE_ON   = 0.80f;
constexpr float    DETECT_SCORE_OFF  = 0.50f;
constexpr uint32_t DETECT_MIN_MS     = 5000;  // ignore blips shorter than this
constexpr uint32_t DETECT_HANG_MS    = 3000;  // gap allowed before an event is "over"

// Fast LED feedback, decoupled from event counting (two-stage LED):
// score above ON for LED_CONFIRM_MS → dim blue "candidate" pulse; once the
// event is confirmed at MIN_MS (it WILL be logged) → bright blue flash; score
// below OFF → back to green within one 250 ms slice, while the event itself
// still closes via the normal HANG timeout in the background.
constexpr uint32_t LED_CONFIRM_MS = 500;

// Start the detection clip this long after the event opens. The event already
// opens MIN_MS (~5 s) into the siren, so the 5 s clip used to cover seconds
// ~5-10 of the pass-by; delaying capture shifts it to ~7-12, closer to the
// loudest point. 0 restores the old behavior. If the event ends before the
// delay elapses, the event is logged without a clip.
constexpr uint32_t CLIP_START_DELAY_MS = 0;

// Auto-recovery safety net: if the DSP fails this many consecutive times,
// reinitialise the continuous classifier; after MAX_RECOVERIES failed reinit
// attempts the board reboots (events + clips are already on LittleFS). With the
// dedicated EI pool (ei_pool.cpp) the DSP no longer shares the system heap with
// WiFi, so this ladder should be unreachable — a -1002 now means the EI pool
// itself is too small (watch the "EIpool" diagnostic / fallback counter), which
// a reinit CAN genuinely fix by releasing the pool's persistent state.
constexpr uint16_t DETECTOR_RECOVER_ERRORS      = 10;
constexpr uint32_t DETECTOR_RECOVER_INTERVAL_MS = 3000; // minimum gap between reinit attempts
constexpr uint8_t  DETECTOR_MAX_RECOVERIES      = 3;     // reinit tries before a reboot

// --- Network-stack watchdog (net_watchdog.cpp) ---
// A burst of parallel/aborted HTTP transfers (web-UI cold load) can wedge
// lwIP/AsyncTCP: WiFi stays associated but no ARP/ICMP/TCP flows, permanently.
// The watchdog pings the gateway and escalates: reconnect, then a controlled
// reboot (never during a detection). Thresholds are deliberately lazy — this
// is a last resort, not a health metric.
constexpr uint32_t NET_WD_PING_INTERVAL_MS = 15000;  // gateway ping cadence
constexpr uint32_t NET_WD_RECONNECT_MS     = 60000;  // silence before WiFi reconnect
constexpr uint32_t NET_WD_REBOOT_MS        = 150000; // silence before reboot

// --- Edge Impulse dedicated heap (ei_pool.cpp) ---
// All EI DSP/inference allocations come from this static pool instead of the
// system heap, so a web-UI load / upload can never starve inference (the old
// -1002 → reboot path). Sizing: the "EIpool low=" diagnostic shows the minimum
// free ever — keep peak use (EI_POOL_BYTES − low) + ~25% margin, and keep the
// fallback counter at 0.
constexpr size_t EI_POOL_BYTES = 40 * 1024;


// --- Event log (LittleFS) ---
constexpr char EVENTS_PATH[] = "/events.csv";

// --- Audio clips (saved per detection, mono 16-bit WAV, FIFO-rotated) ---
// WAV is ~32 KB/s at 16 kHz, so a 5 s clip is ~160 KB. The whole LittleFS
// partition is only ~896 KB, and ~248 KB of that is the web UI, plus up to
// ~160 KB for a Record-tab capture (rec.wav). The clips budget MUST leave room
// for both or LittleFS runs out mid-write and the board reboots (lfs_alloc
// divides by zero when full). 320 KB keeps the ~2 most recent detections and
// leaves a safe margin: 248 (UI) + 320 (clips) + 160 (rec.wav) = 728 KB < 896 KB.
constexpr char     CLIPS_DIR[]        = "/clips";
constexpr uint32_t CLIPS_MAX_BYTES    = 320UL * 1024UL; // FIFO budget; oldest deleted first
constexpr uint16_t CLIP_MAX_SECONDS   = 5;              // cap one clip's length
constexpr uint16_t CLIP_PREROLL_MS    = 1500;           // (reserved) audio from before the trigger
constexpr uint32_t CLIP_SAMPLE_RATE   = 16000;          // mono

// --- Audio recording (M2: labeled WAV capture for Edge Impulse training) ---
// Stored as RAW PCM; the WAV header is prepended at download time (wav_format.h)
// so the file is never rewritten in place (LittleFS CoW crash — see clips note).
constexpr char     REC_PATH[]         = "/rec.pcm";     // single temp recording at a time
// Kept short on purpose: LittleFS copy-on-write overhead makes a single large
// growing file exhaust the allocator well before the raw free space implies
// (it would divide-by-zero in lfs_alloc). 5 s ≈ 160 KB is reliable; record
// several short clips rather than one long one.
constexpr uint16_t REC_MAX_SECONDS    = 5;

// --- Cloud archive (upload detection clips + events to the VPS) ---
// Store-and-forward: the detector captures each clip to LittleFS (clips.cpp)
// during the event, then the cloud task uploads the finished WAV + event AFTER
// the event ends and frees the local copy. Live streaming during detection was
// abandoned — running WiFi alongside the Edge Impulse DSP starved its ~70 KB of
// heap (EIDSP_OUT_OF_MEM) and froze detection (see SPECIFICATIONS §4/§7).
// Host / port / token are secrets in wifi_credentials.h (gitignored).
// STREAM_SAMPLE_RATE/STREAM_BITS describe only the synthetic /api/sim/event clip.
constexpr uint32_t STREAM_SAMPLE_RATE = 8000;          // synthetic test clip rate
constexpr uint8_t  STREAM_BITS        = 8;             // synthetic test clip: 8-bit PCM
constexpr char     CLOUD_AUDIO_PATH[] = "/api/ingest/audio";
constexpr char     CLOUD_EVENT_PATH[] = "/api/ingest/event";
constexpr uint16_t CLOUD_TEST_SECONDS = 4;             // synthetic clip for /api/sim/event
