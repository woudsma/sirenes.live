#include "record.h"
#include "config.h"
#include <LittleFS.h>
#include <esp_heap_caps.h>
#include <time.h>

// Mono 16-bit PCM capture into a PSRAM buffer (see record.h). Deliberately not
// on LittleFS: flash writes from the audio task cap recording length (the CoW
// allocator crashes near a full partition) and burn erase cycles. The HTTP
// handlers only set volatile request flags; record_feed (audio task) owns all
// state changes; the download handler reads the buffer only while no recording
// is active.

static int16_t*          g_buf       = nullptr;
static volatile bool     g_active    = false;
static volatile bool     g_req_start  = false;
static volatile bool     g_req_stop   = false;
static volatile bool     g_req_delete = false;
static volatile uint32_t g_samples   = 0;
static volatile bool     g_has_data  = false;
static volatile uint32_t g_started   = 0; // unix time captured when this recording began
static char              g_label[24]     = "";
static char              g_req_label[24] = "";

static constexpr uint32_t REC_SAMPLES = (uint32_t)REC_MAX_SECONDS * CLIP_SAMPLE_RATE;

void record_init() {
    // One-time migration: recordings used to live on LittleFS — drop leftovers.
    if (LittleFS.exists("/rec.wav")) LittleFS.remove("/rec.wav");
    if (LittleFS.exists("/rec.pcm")) LittleFS.remove("/rec.pcm");

    g_buf = (int16_t*)heap_caps_malloc(REC_SAMPLES * 2, MALLOC_CAP_SPIRAM);
    if (!g_buf)
        Serial.println("Record: PSRAM alloc FAILED — recording disabled");
    else
        Serial.printf("Record: PSRAM buffer ready (%us, %u KB)\n",
                      (unsigned)REC_MAX_SECONDS, (unsigned)(REC_SAMPLES * 2 / 1024));
}

// --- called from the web server (core 1): just flag the request ---
bool record_start(const char* label) {
    if (!g_buf || g_active || g_req_start) return false;
    strncpy(g_req_label, label && *label ? label : "sample", sizeof(g_req_label));
    g_req_label[sizeof(g_req_label) - 1] = '\0';
    g_req_stop  = false;
    g_req_start = true;
    return true;
}

void record_stop() {
    if (g_active) g_req_stop = true;
}

// Flagged by the web server (core 1) once a download finishes; applied on the
// audio task in record_feed, same as all other recording state changes.
void record_request_delete() {
    g_req_delete = true;
}

// --- called from the audio task (core 0): owns all recording state ---
void record_feed(const int16_t* pcm, size_t n) {
    if (g_req_start) {
        g_req_start = false;
        g_has_data  = false;
        g_samples   = 0;
        g_started   = (uint32_t)time(nullptr); // 0/garbage until NTP has synced
        strncpy(g_label, g_req_label, sizeof(g_label));
        g_label[sizeof(g_label) - 1] = '\0';
        g_active = true;
        Serial.printf("Recording: label=%s cap=%us\n", g_label, (unsigned)REC_MAX_SECONDS);
    }

    if (g_active && pcm && n) {
        uint32_t room = REC_SAMPLES - g_samples;
        size_t   w    = n < room ? n : room;
        if (w > 0) {
            memcpy(g_buf + g_samples, pcm, w * 2);
            g_samples += w;
        }
        if (g_samples >= REC_SAMPLES) g_req_stop = true; // auto-stop at the cap
    }

    if (g_req_stop) {
        g_req_stop = false;
        if (g_active) {
            g_active   = false;
            g_has_data = g_samples > 0;
            Serial.printf("Recording stopped: %u samples\n", (unsigned)g_samples);
        }
    }

    // Discard the buffer once it has been downloaded (a new recording also
    // overwrites it at start). Skip while a recording is in progress.
    if (g_req_delete) {
        g_req_delete = false;
        if (!g_active && g_has_data) {
            g_has_data = false;
            g_samples  = 0;
            Serial.println("Recording discarded after download");
        }
    }
}

bool        record_active()     { return g_active; }
bool        record_has_data()   { return g_has_data; }
uint32_t    record_seconds()    { return g_samples / CLIP_SAMPLE_RATE; }
uint32_t    record_timestamp()  { return g_started; }
const char* record_label()      { return g_label; }

const int16_t* record_data()         { return g_buf; }
uint32_t       record_sample_count() { return g_has_data ? g_samples : 0; }
