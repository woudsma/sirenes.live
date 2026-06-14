#pragma once
#include <Arduino.h>
#include "config.h"

// Build a 44-byte WAV header for mono 16-bit PCM at CLIP_SAMPLE_RATE (16 kHz).
//
// Recordings and detection clips are stored on LittleFS as RAW PCM and this
// header is prepended on the fly when a file is downloaded, played or uploaded.
// Never write it into the file and backfill sizes later: LittleFS files are
// copy-on-write CTZ skip-lists, so rewriting byte 0 of a 160 KB file forces a
// copy of the WHOLE file — finalizing a WAV needs ~2x its size in free blocks,
// and when that isn't available lfs_alloc divides by zero and reboots the
// board (seen live: IntegerDivideByZero in lfs_ctz_extend ← file close).
static inline void wav_header_16k16(uint8_t h[44], uint32_t data_bytes) {
    auto put32 = [](uint8_t* p, uint32_t v) { p[0]=v; p[1]=v>>8; p[2]=v>>16; p[3]=v>>24; };
    auto put16 = [](uint8_t* p, uint16_t v) { p[0]=v; p[1]=v>>8; };
    const uint32_t sr = CLIP_SAMPLE_RATE;
    memcpy(h, "RIFF", 4);          put32(h + 4, 36 + data_bytes);
    memcpy(h + 8, "WAVE", 4);
    memcpy(h + 12, "fmt ", 4);     put32(h + 16, 16);
    put16(h + 20, 1);              put16(h + 22, 1);   // PCM, mono
    put32(h + 24, sr);             put32(h + 28, sr * 2);
    put16(h + 32, 2);              put16(h + 34, 16);  // block align, bits/sample
    memcpy(h + 36, "data", 4);     put32(h + 40, data_bytes);
}
