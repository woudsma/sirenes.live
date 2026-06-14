#pragma once
#include <Arduino.h>
#include <time.h>

// Uploads each detection's audio + event to the VPS archive — AFTER the event
// ends, not live. The detector captures the clip to LittleFS (clips.cpp) during
// the event, then hands it here; a dedicated task (core 1) POSTs the WAV file and
// the event JSON, with the 5 Hz WS broadcast paused for the transfer. This avoids
// running WiFi alongside the Edge Impulse DSP during detection — concurrent live
// streaming starved the DSP of heap (EIDSP_OUT_OF_MEM) and froze detection.
// Everything is best-effort: uploads are skipped when WiFi is down or the host is
// unset; the event is always also in the local events.csv. On a successful audio
// upload the local clip is deleted (freeing flash); failed ones stay and the
// clips FIFO rotates them.

void cloud_init();

// Queue an upload for a finished detection. The audio is expected at
// CLIPS_DIR/<epoch>.pcm (uploaded as WAV if present; the event is posted either way).
void cloud_upload_clip(time_t epoch, uint16_t duration_s, float peak_db, float confidence);

// Test hook (no mic needed): synthesize a short two-tone siren clip for `epoch`
// and post a matching event. Used by /api/sim/event to exercise the upload path.
void cloud_test_clip(time_t epoch, uint16_t duration_s, float peak_db, float confidence);

// True while uploads are enabled (host configured).
bool cloud_enabled();
