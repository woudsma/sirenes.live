#include "clips.h"
#include "config.h"
#include <LittleFS.h>
#include <vector>
#include <esp_heap_caps.h>

// See clips.h. Two CLIP_MAX_SECONDS buffers in PSRAM: one being captured while
// the previous may still be uploading/persisting on the cloud task. Capture only
// runs while an event is active — by design nothing is recorded outside a
// detection (privacy), and the audio task only ever memcpys into PSRAM here, no
// flash I/O during live detection. A clip hits flash only via clips_persist()
// on the cloud task, as raw PCM ("<epoch>.pcm", WAV header prepended at
// serve/upload time — see wav_format.h for why headers are never written to
// flash).

namespace {

constexpr uint32_t CLIP_SAMPLES = (uint32_t)CLIP_MAX_SECONDS * CLIP_SAMPLE_RATE;

struct ClipBuf {
    int16_t*          data    = nullptr;
    uint32_t          samples = 0;
    volatile bool     busy    = false; // set by audio task, cleared by cloud task
};
ClipBuf g_buf[2];

int      g_cur = -1;          // buffer being captured, -1 if none
char     g_name[24] = "";

// Keep this many bytes free for LittleFS metadata/flush (lfs_alloc
// divides-by-zero when the partition is full).
const uint32_t CLIP_FREE_MARGIN = 64 * 1024;

const char* basename_of(const char* p) {
    const char* slash = strrchr(p, '/');
    return slash ? slash + 1 : p;
}

String full_path(const char* name) {
    return String(CLIPS_DIR) + "/" + name;
}

uint32_t scan_usage() {
    uint32_t total = 0;
    File dir = LittleFS.open(CLIPS_DIR);
    if (!dir || !dir.isDirectory()) return 0;
    for (File f = dir.openNextFile(); f; f = dir.openNextFile())
        total += f.size();
    return total;
}

// Rotate out the oldest persisted clips until `headroom` bytes fit under the
// budget. Usage is rescanned each call (persist is rare; deletes can come from
// the web-server task, so a shared counter would need locking).
void enforce_budget(uint32_t headroom) {
    uint32_t used = scan_usage();
    while (used + headroom > CLIPS_MAX_BYTES) {
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
        used = (used > oldestSize) ? used - oldestSize : 0;
        Serial.printf("Clips: rotated out %s\n", oldestName.c_str());
    }
}

} // namespace

void clips_init() {
    if (!LittleFS.exists(CLIPS_DIR)) LittleFS.mkdir(CLIPS_DIR);

    g_buf[0].data = (int16_t*)heap_caps_malloc(CLIP_SAMPLES * 2, MALLOC_CAP_SPIRAM);
    g_buf[1].data = (int16_t*)heap_caps_malloc(CLIP_SAMPLES * 2, MALLOC_CAP_SPIRAM);
    if (!g_buf[0].data || !g_buf[1].data) {
        // This hardware always has PSRAM; if the alloc fails, capture is off but
        // detection/eventing still run.
        Serial.println("Clips: PSRAM alloc FAILED — clip capture disabled");
        return;
    }

    Serial.printf("Clips: 2x%us PSRAM buffers (%u KB) | %u bytes persisted (budget %u)\n",
                  (unsigned)CLIP_MAX_SECONDS,
                  (unsigned)(2 * CLIP_SAMPLES * 2 / 1024),
                  (unsigned)scan_usage(), (unsigned)CLIPS_MAX_BYTES);
}

bool clips_begin(time_t epoch) {
    if (!g_buf[0].data) return false;
    int id = !g_buf[0].busy ? 0 : (!g_buf[1].busy ? 1 : -1);
    if (id < 0) {
        // Both buffers still with the cloud task (shouldn't happen: the detector
        // is paused during uploads) — log the event without a clip.
        Serial.println("Clips: no free buffer — event will have no clip");
        g_name[0] = '\0';
        return false;
    }
    g_buf[id].busy    = true;
    g_buf[id].samples = 0;
    g_cur             = id;
    snprintf(g_name, sizeof(g_name), "%ld.pcm", (long)epoch);
    return true;
}

void clips_write(const int16_t* samples, size_t n) {
    if (g_cur < 0 || !samples) return;
    ClipBuf& b = g_buf[g_cur];
    if (b.samples >= CLIP_SAMPLES) return;        // length cap reached
    uint32_t room = CLIP_SAMPLES - b.samples;
    size_t   w    = n < room ? n : room;
    memcpy(b.data + b.samples, samples, w * 2);
    b.samples += w;
}

int clips_end() {
    if (g_cur < 0) return -1;
    int id = g_cur;
    g_cur  = -1;
    if (g_buf[id].samples == 0) {
        g_buf[id].busy = false;
        g_name[0] = '\0';
        return -1;
    }
    return id;
}

const int16_t* clips_buffer_data(int id) {
    return (id == 0 || id == 1) ? g_buf[id].data : nullptr;
}

uint32_t clips_buffer_samples(int id) {
    return (id == 0 || id == 1) ? g_buf[id].samples : 0;
}

void clips_buffer_release(int id) {
    if (id == 0 || id == 1) g_buf[id].busy = false;
}

bool clips_persist(int id, time_t epoch) {
    const int16_t* data = clips_buffer_data(id);
    uint32_t bytes = clips_buffer_samples(id) * 2;
    if (!data || !bytes) return false;

    enforce_budget(bytes);
    uint32_t total = LittleFS.totalBytes();
    uint32_t used  = LittleFS.usedBytes();
    uint32_t freeb = total > used ? total - used : 0;
    if (freeb < bytes + CLIP_FREE_MARGIN) {
        Serial.printf("Clips: persist skipped (free=%u too low)\n", (unsigned)freeb);
        return false;
    }

    char name[24];
    snprintf(name, sizeof(name), "%ld.pcm", (long)epoch);
    File f = LittleFS.open(full_path(name), "w");
    if (!f) return false;
    // Write in slices so one call never blocks the FS lock for the whole clip.
    const int16_t* p = data;
    uint32_t left = bytes;
    while (left) {
        uint32_t w = left > 8192 ? 8192 : left;
        if (f.write((const uint8_t*)p, w) != w) break;
        p += w / 2;
        left -= w;
    }
    f.close();
    if (left) { LittleFS.remove(full_path(name)); return false; }
    Serial.printf("Clips: persisted %s (%u bytes)\n", name, (unsigned)bytes);
    return true;
}

void clips_remove(const char* name) {
    if (!name || !*name) return;
    LittleFS.remove(full_path(name));
}

void clips_clear() {
    std::vector<String> names; // collect first; removing during iteration is unsafe
    File dir = LittleFS.open(CLIPS_DIR);
    if (dir && dir.isDirectory())
        for (File f = dir.openNextFile(); f; f = dir.openNextFile())
            names.push_back(basename_of(f.name()));
    for (auto& nm : names) LittleFS.remove(full_path(nm.c_str()));
}

const char* clips_current_name() {
    return g_name;
}

uint32_t clips_bytes_used() {
    return scan_usage();
}
