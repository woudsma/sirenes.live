#include "record.h"
#include "config.h"
#include <LittleFS.h>
#include <time.h>

// Mono 16-bit PCM capture. ALL filesystem I/O happens on the audio task
// (core 0) inside record_feed(); the HTTP handlers only set volatile request
// flags. This keeps blocking LittleFS calls off the async_tcp task — doing them
// there tripped the task watchdog on larger files and rebooted the board.
//
// The file is RAW PCM, not WAV: the 44-byte header is prepended by the download
// handler (webserver.cpp, wav_format.h). Writing a header up front and seeking
// back to fill in the sizes — the old scheme — made LittleFS copy-on-write the
// ENTIRE file at close (CTZ skip-list), which needs ~2x the file size in free
// blocks and crashed the board (lfs_alloc IntegerDivideByZero) when space was
// tight, e.g. with the clips FIFO full of upload-pending detections.

static File              g_file;
static volatile bool     g_active    = false;
static volatile bool     g_req_start  = false;
static volatile bool     g_req_stop   = false;
static volatile bool     g_req_delete = false;
static volatile uint32_t g_samples   = 0;
static volatile uint32_t g_cap       = 0; // sample cap for this recording (time- or space-limited)
static volatile uint32_t g_free      = 0; // LittleFS free bytes measured at last start (diagnostics)
static volatile uint32_t g_started   = 0; // unix time captured when this recording began
static char              g_label[24]     = "";
static char              g_req_label[24] = "";

// Keep this many bytes free so LittleFS always has spare blocks for the final
// flush + metadata at close (LittleFS divides-by-zero in lfs_alloc when full).
static const uint32_t REC_FREE_MARGIN = 64 * 1024;

void record_init() {
    // One-time migration: drop a leftover recording in the old WAV-on-flash
    // format (the path changed to .pcm when headers moved to download time).
    if (LittleFS.exists("/rec.wav")) LittleFS.remove("/rec.wav");
}

// --- called from the web server (core 1): just flag the request ---
bool record_start(const char* label) {
    if (g_active || g_req_start) return false;
    strncpy(g_req_label, label && *label ? label : "sample", sizeof(g_req_label));
    g_req_label[sizeof(g_req_label) - 1] = '\0';
    g_req_stop  = false;
    g_req_start = true;
    return true;
}

void record_stop() {
    if (g_active) g_req_stop = true;
}

// Flagged by the web server (core 1) once a download finishes; the actual remove
// happens on the audio task (core 0) in record_feed, same as all other rec I/O.
void record_request_delete() {
    g_req_delete = true;
}

// --- called from the audio task (core 0): owns all file I/O ---
void record_feed(const int16_t* pcm, size_t n) {
    if (g_req_start) {
        g_req_start = false;
        // Free /rec.wav first so its blocks are reclaimed before we measure free space.
        if (LittleFS.exists(REC_PATH)) LittleFS.remove(REC_PATH);
        uint32_t total = LittleFS.totalBytes();
        uint32_t used  = LittleFS.usedBytes();
        g_free = total > used ? total - used : 0;

        uint32_t by_time  = (uint32_t)REC_MAX_SECONDS * CLIP_SAMPLE_RATE;
        uint32_t by_space = g_free > REC_FREE_MARGIN
                            ? (g_free - REC_FREE_MARGIN) / 2 : 0;
        g_cap = by_time < by_space ? by_time : by_space;

        g_file = (g_cap > 0) ? LittleFS.open(REC_PATH, "w") : File();
        if (g_file) {
            g_samples = 0;
            g_started = (uint32_t)time(nullptr); // 0/garbage until NTP has synced
            strncpy(g_label, g_req_label, sizeof(g_label));
            g_label[sizeof(g_label) - 1] = '\0';
            g_active = true;
            Serial.printf("Recording: label=%s total=%u used=%u free=%u cap=%us\n",
                          g_label, (unsigned)total, (unsigned)used, (unsigned)g_free,
                          (unsigned)(g_cap / CLIP_SAMPLE_RATE));
        } else {
            Serial.printf("Recording NOT started: free=%u too low\n", (unsigned)g_free);
        }
    }

    if (g_active && g_file && pcm && n) {
        uint32_t room = g_cap - g_samples;
        size_t   w    = n < room ? n : room;
        if (w > 0) g_samples += g_file.write((const uint8_t*)pcm, w * 2) / 2;
        if (g_samples >= g_cap) g_req_stop = true; // auto-stop at time- or space-cap
    }

    if (g_req_stop) {
        g_req_stop = false;
        if (g_active) {
            // Raw PCM: just close — no header backfill, so no whole-file
            // copy-on-write near a full partition (see header comment).
            g_file.close();
            g_active = false;
            Serial.printf("Recording stopped: %u samples\n", (unsigned)g_samples);
        }
    }

    // Remove the clip once it has been downloaded (a new recording also frees it
    // at start). Skip if a recording is in progress to avoid yanking the open file.
    if (g_req_delete) {
        g_req_delete = false;
        if (!g_active && LittleFS.exists(REC_PATH)) {
            LittleFS.remove(REC_PATH);
            Serial.println("Recording deleted after download");
        }
    }
}

bool        record_active()     { return g_active; }
uint32_t    record_seconds()    { return g_samples / CLIP_SAMPLE_RATE; }
uint32_t    record_free_bytes() { return g_free; }
uint32_t    record_timestamp()  { return g_started; }
const char* record_label()      { return g_label; }
const char* record_path()       { return REC_PATH; }
