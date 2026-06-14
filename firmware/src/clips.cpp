#include "clips.h"
#include "config.h"
#include <LittleFS.h>
#include <vector>
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"

// Per-detection audio clips, stored as RAW mono 16-bit PCM ("<epoch>.pcm") in
// CLIPS_DIR and FIFO-rotated to stay under CLIPS_MAX_BYTES. Uncompressed is
// ~32 KB/s at 16 kHz so only a few recent clips fit — fine, they're uploaded to
// the VPS and deleted right after. All file I/O here runs on the audio task
// (core 0), same as record.cpp.
//
// RAW PCM, not WAV: the 44-byte header is prepended when a clip is served
// (/api/clip) or uploaded (cloud.cpp) — see wav_format.h. The old scheme wrote
// a placeholder header and seeked back to fill in sizes at clips_end(), which
// makes LittleFS copy-on-write the WHOLE file (CTZ skip-list): a 160 KB clip
// transiently needs another ~160 KB free at close, and when the partition was
// tight (clips FIFO full of upload-pending detections) lfs_alloc divided by
// zero and rebooted the board mid-listening.

static File     g_file;
static char     g_name[24] = "";
static uint32_t g_used     = 0;
static uint32_t g_samples  = 0; // samples written to the current clip

// Cross-core delete requests (cloud upload task → audio task); names are 24 chars.
static QueueHandle_t g_del_q = nullptr;

// Keep this many bytes free for LittleFS metadata/flush at close, matching the
// recorder's margin (lfs_alloc divides-by-zero when the partition is full).
static const uint32_t CLIP_FREE_MARGIN = 64 * 1024;

// Rotate out the oldest clips until at least `headroom` bytes stay free under
// budget. Defined below; declared here so clips_begin() can pre-rotate.
static void enforce_budget(uint32_t headroom = 0);

// Return the basename ("123.pcm") regardless of whether the core reports a path.
static const char* basename_of(const char* p) {
    const char* slash = strrchr(p, '/');
    return slash ? slash + 1 : p;
}

static String full_path(const char* name) {
    return String(CLIPS_DIR) + "/" + name;
}

static uint32_t scan_usage() {
    uint32_t total = 0;
    File dir = LittleFS.open(CLIPS_DIR);
    if (!dir || !dir.isDirectory()) return 0;
    for (File f = dir.openNextFile(); f; f = dir.openNextFile())
        total += f.size();
    return total;
}

void clips_init() {
    if (!LittleFS.exists(CLIPS_DIR)) LittleFS.mkdir(CLIPS_DIR);
    if (!g_del_q) g_del_q = xQueueCreate(4, 24);

    // One-time migration: purge clips in the old WAV-on-flash format (clips are
    // now raw .pcm with the header added at serve/upload time). Old event rows
    // pointing at them just lose playback, same as a FIFO-rotated clip.
    {
        std::vector<String> legacy;
        File dir = LittleFS.open(CLIPS_DIR);
        if (dir && dir.isDirectory())
            for (File f = dir.openNextFile(); f; f = dir.openNextFile()) {
                String nm = basename_of(f.name());
                if (nm.endsWith(".wav")) legacy.push_back(nm);
            }
        for (auto& nm : legacy) {
            LittleFS.remove(full_path(nm.c_str()));
            Serial.printf("Clips: purged legacy %s\n", nm.c_str());
        }
    }

    g_used = scan_usage();
    Serial.printf("Clips: %u bytes used (budget %u)\n", g_used, (unsigned)CLIPS_MAX_BYTES);
}

bool clips_begin(time_t epoch) {
    // Make room for a full-length clip UP FRONT. g_used only counts finished
    // clips (the in-progress one is added in clips_end), so without this a new
    // clip writes on top of an already-full budget and overruns LittleFS.
    const uint32_t max_bytes = (uint32_t)CLIP_MAX_SECONDS * CLIP_SAMPLE_RATE * 2;
    enforce_budget(max_bytes);

    // Bail out (no clip) if the partition still can't safely hold one — better a
    // missing clip than a reboot. A Record-tab capture may be using the space.
    uint32_t total = LittleFS.totalBytes();
    uint32_t used  = LittleFS.usedBytes();
    uint32_t freeb = total > used ? total - used : 0;
    if (freeb < max_bytes + CLIP_FREE_MARGIN) {
        g_name[0] = '\0';
        Serial.printf("Clips: skipped (free=%u too low for a clip)\n", (unsigned)freeb);
        return false;
    }

    snprintf(g_name, sizeof(g_name), "%ld.pcm", (long)epoch);
    g_file = LittleFS.open(full_path(g_name), "w");
    g_samples = 0;
    if (!g_file) {
        g_name[0] = '\0';
        return false;
    }
    return true; // raw PCM from byte 0 — header is added at serve/upload time
}

void clips_write(const int16_t* samples, size_t n) {
    if (!g_file || !samples) return;
    const uint32_t cap = (uint32_t)CLIP_MAX_SECONDS * CLIP_SAMPLE_RATE;
    if (g_samples >= cap) return;                 // length cap reached
    uint32_t room = cap - g_samples;
    size_t   w    = n < room ? n : room;          // don't exceed the cap
    if (w) g_samples += g_file.write((const uint8_t*)samples, w * 2) / 2;
}

static void enforce_budget(uint32_t headroom) {
    while (g_used + headroom > CLIPS_MAX_BYTES) {
        // delete the oldest clip (smallest epoch in the filename)
        File dir = LittleFS.open(CLIPS_DIR);
        if (!dir || !dir.isDirectory()) return;
        long oldest = -1;
        String oldestName;
        uint32_t oldestSize = 0;
        for (File f = dir.openNextFile(); f; f = dir.openNextFile()) {
            const char* nm = basename_of(f.name());
            long ep = atol(nm);
            if (oldest < 0 || ep < oldest) {
                oldest = ep;
                oldestName = nm;
                oldestSize = f.size();
            }
        }
        if (oldestName.isEmpty()) return;
        LittleFS.remove(full_path(oldestName.c_str()));
        g_used = (g_used > oldestSize) ? g_used - oldestSize : 0;
        Serial.printf("Clips: rotated out %s\n", oldestName.c_str());
    }
}

void clips_end() {
    if (!g_file) return;
    // Raw PCM: just close. No header backfill → no whole-file copy-on-write
    // near a full partition (see the header comment).
    size_t size = g_file.size();
    g_file.close();

    if (g_samples == 0) {
        // No audio captured — drop the header-only file so events don't link an empty clip.
        LittleFS.remove(full_path(g_name));
        g_name[0] = '\0';
        return;
    }
    g_used += size;
    enforce_budget();
}

void clips_remove(const char* name) {
    if (!name || !*name) return;
    String p = full_path(name);
    File f = LittleFS.open(p, "r");
    uint32_t sz = f ? f.size() : 0;
    if (f) f.close();
    if (LittleFS.remove(p)) g_used = (g_used > sz) ? g_used - sz : 0;
}

void clips_request_remove(const char* name) {
    if (!g_del_q || !name || !*name) return;
    char buf[24];
    strncpy(buf, name, sizeof(buf));
    buf[sizeof(buf) - 1] = '\0';
    xQueueSend(g_del_q, buf, 0); // drop if backlog full; FIFO will reclaim it later
}

void clips_service() {
    if (!g_del_q) return;
    char buf[24];
    while (xQueueReceive(g_del_q, buf, 0)) clips_remove(buf);
}

void clips_clear() {
    std::vector<String> names; // collect first; removing during iteration is unsafe
    File dir = LittleFS.open(CLIPS_DIR);
    if (dir && dir.isDirectory())
        for (File f = dir.openNextFile(); f; f = dir.openNextFile())
            names.push_back(basename_of(f.name()));
    for (auto& nm : names) LittleFS.remove(full_path(nm.c_str()));
    g_used = 0;
}

const char* clips_current_name() {
    return g_name;
}

uint32_t clips_bytes_used() {
    return g_used;
}
