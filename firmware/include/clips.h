#pragma once
#include <Arduino.h>

// Per-detection audio clips, captured into PSRAM buffers during the event
// (starting when the event is confirmed — nothing is buffered outside a
// detection). The cloud task uploads a finished buffer to the VPS; clips only
// touch LittleFS (CLIPS_DIR, FIFO-rotated under CLIPS_MAX_BYTES) when an upload
// fails or the cloud is disabled. Capture calls (begin/write/end) run on the
// audio task; buffer reads + persist/release run on the cloud task; remove/clear
// may run on the web-server task.

void clips_init();

// Start capturing a clip for an event at `epoch`. Returns false if no clip
// buffer is free (both handed to the cloud task). On success,
// clips_current_name() holds the "<epoch>.pcm" name.
bool clips_begin(time_t epoch);

// Append live PCM to the current clip (capped at CLIP_MAX_SECONDS).
void clips_write(const int16_t* samples, size_t n);

// Finalize the current clip. Returns the buffer id to hand to the cloud task
// (it must be released with clips_buffer_release), or -1 if nothing captured.
int clips_end();

// --- clip buffer access (cloud task, after clips_end handed it over) ---
const int16_t* clips_buffer_data(int id);
uint32_t       clips_buffer_samples(int id);      // 16 kHz mono samples
// Write the buffer to CLIPS_DIR/<epoch>.pcm under the FIFO budget (upload
// failed or cloud disabled). Returns false if it didn't fit.
bool clips_persist(int id, time_t epoch);
void clips_buffer_release(int id);

// Delete one persisted clip by filename (e.g. "1717245600.pcm").
void clips_remove(const char* name);

// Delete every persisted clip in CLIPS_DIR.
void clips_clear();

// Filename (no path, e.g. "1717245600.pcm") of the clip being captured, or "".
const char* clips_current_name();

// Bytes used by persisted clips in CLIPS_DIR (directory scan).
uint32_t clips_bytes_used();
