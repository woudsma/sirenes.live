#pragma once
#include <Arduino.h>

// Per-detection audio clips: mono 16-bit PCM WAV in CLIPS_DIR on LittleFS,
// FIFO-rotated to stay under CLIPS_MAX_BYTES.

void clips_init();

// Open a new clip for an event starting at `epoch`. Returns false if storage
// could not be prepared. On success, clips_current_name() holds its filename.
bool clips_begin(time_t epoch);

// Append captured PCM to the current clip's data chunk (capped at
// CLIP_MAX_SECONDS); the WAV header sizes are backfilled in clips_end().
void clips_write(const int16_t* samples, size_t n);

// Finalize the current clip and enforce the storage budget (delete oldest).
void clips_end();

// Delete one clip by filename (e.g. "1717245600.pcm"), keeping usage in sync.
void clips_remove(const char* name);

// Queue a clip for deletion from another task (e.g. the cloud upload task on
// core 1). The actual LittleFS remove runs on the audio task via clips_service(),
// keeping all clip file I/O on core 0.
void clips_request_remove(const char* name);

// Process queued deletions. Call from the audio task (core 0).
void clips_service();

// Delete every clip in CLIPS_DIR and reset usage.
void clips_clear();

// Filename (no path, e.g. "1717245600.pcm") of the clip just written, or "".
const char* clips_current_name();

// Current bytes used by the clips directory.
uint32_t clips_bytes_used();
