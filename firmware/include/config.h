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
// (GET /api/record/download sends up to a ~1 MB WAV) and for a short cool-down after,
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
constexpr bool SERIAL_AUDIO_MONITOR = true;

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

// Simple one-pole high-pass filter applied to the PCM fed to the classifier +
// recordings. The ICS-43434 picks up strong low-frequency mechanical rumble
// (speaker cabinet / desk coupling) that buries the 600-2500 Hz siren band. The
// HPF also blocks DC. The Dutch two-tone siren fundamental is ~600-800 Hz, so a
// cut here rolls off the rumble without touching the siren. 0 disables.
constexpr float AUDIO_HPF_HZ         = 300.0f;

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
// 44 KB: measured low-water was ~300 bytes at 40 KB, and the 16-byte-aligned
// allocations (required by the S3 aes3 DSP kernels — see ei_pool.cpp) add a few
// bytes of padding per alloc.
constexpr size_t EI_POOL_BYTES = 44 * 1024;


// --- Event log (LittleFS) ---
constexpr char EVENTS_PATH[] = "/events.csv";

// --- Audio clips (captured per detection into PSRAM — see clips.cpp) ---
// PCM is 32 KB/s at 16 kHz. Capture runs ONLY while an event is active (nothing
// is buffered outside a detection — privacy) into two CLIP_MAX_SECONDS PSRAM
// buffers (320 KB total): one being captured while the previous may still be
// uploading. 5 s keeps the archive small on the VPS. LittleFS (CLIPS_DIR, FIFO
// under CLIPS_MAX_BYTES) only stores clips whose upload failed or when the
// cloud is disabled; the 8 MB partition table leaves ~4.9 MB for the FS, so
// 2.5 MB ≈ 16 fallback clips alongside the ~250 KB UI.
constexpr char     CLIPS_DIR[]        = "/clips";
constexpr uint32_t CLIPS_MAX_BYTES    = 2560UL * 1024UL; // FIFO budget; oldest deleted first
constexpr uint16_t CLIP_MAX_SECONDS   = 5;              // cap one clip's length (160 KB)
constexpr uint32_t CLIP_SAMPLE_RATE   = 16000;          // mono

// --- Audio recording (M2: labeled WAV capture for Edge Impulse training) ---
// Captured into a PSRAM buffer (960 KB), WAV header prepended at download time
// (wav_format.h). PSRAM, not LittleFS: flash writes cap the length and burn
// erase cycles.
constexpr uint16_t REC_MAX_SECONDS    = 30;

// --- Cloud archive (upload detection clips + events to the VPS) ---
// Store-and-forward: the detector captures each clip into a PSRAM buffer
// (clips.cpp) during the event, then the cloud task uploads the WAV + event
// AFTER the event ends (persisting to LittleFS only if the upload can't
// happen). Live streaming during detection was abandoned — running WiFi
// alongside the Edge Impulse DSP starved its ~70 KB of heap (EIDSP_OUT_OF_MEM)
// and froze detection (see SPECIFICATIONS §4/§7).
// Host / port / token are secrets in wifi_credentials.h (gitignored).
// STREAM_SAMPLE_RATE/STREAM_BITS describe only the synthetic /api/sim/event clip.
constexpr uint32_t STREAM_SAMPLE_RATE = 8000;          // synthetic test clip rate
constexpr uint8_t  STREAM_BITS        = 8;             // synthetic test clip: 8-bit PCM
constexpr char     CLOUD_AUDIO_PATH[] = "/api/ingest/audio";
constexpr char     CLOUD_EVENT_PATH[] = "/api/ingest/event";
constexpr uint16_t CLOUD_TEST_SECONDS = 4;             // synthetic clip for /api/sim/event
