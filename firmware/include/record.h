#pragma once
#include <Arduino.h>

// M2 data collection: capture mono 16-bit PCM from the live audio stream to a
// single WAV file on LittleFS, for download and upload to Edge Impulse Studio.

void        record_init();
bool        record_start(const char* label); // false if already recording / FS error
void        record_feed(const int16_t* pcm, size_t n); // called from the audio task
void        record_stop();
void        record_request_delete(); // delete /rec.wav after it has been downloaded
bool        record_active();
uint32_t    record_seconds();
uint32_t    record_free_bytes(); // LittleFS free measured at last start (diagnostics)
uint32_t    record_timestamp();  // unix time captured when the recording began (0 if no NTP)
const char* record_label();
const char* record_path();
