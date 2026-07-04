#pragma once
#include <Arduino.h>
#include <time.h>

// Uploads each detection's audio + event to the VPS archive — AFTER the event
// ends, not live. The detector captures the clip into a PSRAM buffer (clips.cpp)
// during the event, then hands the buffer here; a dedicated task (core 1) POSTs
// the WAV and the event JSON, with the 5 Hz WS broadcast paused for the transfer.
// This avoids running WiFi alongside the Edge Impulse DSP during detection —
// concurrent live streaming starved the DSP of heap (EIDSP_OUT_OF_MEM) and froze
// detection. When the upload can't happen (host unset, WiFi down, HTTP failure)
// the buffer is persisted to CLIPS_DIR/<epoch>.pcm instead so local playback
// keeps working; the buffer is always released afterwards. The event is always
// also in the local events.csv.

void cloud_init();

// Queue a finished detection. `clip_buf` is the clips.cpp buffer id from
// clips_end(), or -1 for no audio (the event is posted either way). Takes
// ownership of the buffer: it is released here even if queueing fails.
void cloud_submit_clip(time_t epoch, uint16_t duration_s, float peak_db,
                       float confidence, int clip_buf);

// Test hook (no mic needed): synthesize a short two-tone siren clip for `epoch`
// and post a matching event. Used by /api/sim/event to exercise the upload path.
void cloud_test_clip(time_t epoch, uint16_t duration_s, float peak_db, float confidence);

// True while uploads are enabled (host configured).
bool cloud_enabled();
