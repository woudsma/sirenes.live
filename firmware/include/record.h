#pragma once
#include <Arduino.h>

// M2 data collection: capture mono 16-bit PCM from the live audio stream into a
// PSRAM buffer (REC_MAX_SECONDS), served as WAV by the download endpoint. Never
// touches flash. record_feed runs on the audio task; the HTTP handlers only set
// request flags / read the finished buffer.

void        record_init();
bool        record_start(const char* label); // false if already recording
void        record_feed(const int16_t* pcm, size_t n); // called from the audio task
void        record_stop();
void        record_request_delete(); // discard the buffer after it has been downloaded
bool        record_active();
bool        record_has_data();       // a finished recording is available
uint32_t    record_seconds();
uint32_t    record_timestamp();      // unix time captured when the recording began (0 if no NTP)
const char* record_label();

// Finished recording, for the download handler (valid while !record_active()
// and record_has_data(); a new start or the delete request invalidates it).
const int16_t* record_data();
uint32_t       record_sample_count();
