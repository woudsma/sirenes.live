#include "cloud.h"
#include "config.h"
#include "wifi_credentials.h"
#include "wav_format.h"
#include "clips.h"
#include "detector.h"
#include "audio.h"
#include "webserver.h"
#include <WiFi.h>
#include <LittleFS.h>
#include <math.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"

// See cloud.h. Store-and-forward: the detector writes the clip to LittleFS during
// the event, then queues a Job here. This task (core 1) uploads the finished WAV
// and posts the event — after the detection, never during it — so WiFi never
// competes with the Edge Impulse DSP for heap mid-detection. The WS broadcast is
// paused for each upload, mirroring the (proven-stable) record-download path.

#ifndef CLOUD_HOST
#define CLOUD_HOST ""
#endif
#ifndef CLOUD_PORT
#define CLOUD_PORT 80
#endif
#ifndef CLOUD_DEVICE_TOKEN
#define CLOUD_DEVICE_TOKEN ""
#endif

namespace {

QueueHandle_t g_jobs = nullptr;

struct Job {
    time_t   epoch;
    uint16_t dur;
    float    db;
    float    conf;
    bool     synthetic; // true → generate a test tone instead of reading a file
};

bool host_set() { return CLOUD_HOST[0] != '\0'; }
bool wifi_up()  { return WiFi.status() == WL_CONNECTED; }

void put32(uint8_t* p, uint32_t v) { p[0]=v; p[1]=v>>8; p[2]=v>>16; p[3]=v>>24; }
void put16(uint8_t* p, uint16_t v) { p[0]=v; p[1]=v>>8; }

// 8 kHz / 8-bit unsigned mono WAV header (used by the synthetic test clip).
void wav_header8(uint8_t h[44], uint32_t data_bytes) {
    const uint32_t sr = STREAM_SAMPLE_RATE;
    memcpy(h, "RIFF", 4);      put32(h + 4, 36 + data_bytes);
    memcpy(h + 8, "WAVE", 4);
    memcpy(h + 12, "fmt ", 4); put32(h + 16, 16);
    put16(h + 20, 1);          put16(h + 22, 1);   // PCM, mono
    put32(h + 24, sr);         put32(h + 28, sr);  // byte rate = sr * 1
    put16(h + 32, 1);          put16(h + 34, 8);   // block align, bits
    memcpy(h + 36, "data", 4); put32(h + 40, data_bytes);
}

String clip_path(time_t epoch) {
    return String(CLIPS_DIR) + "/" + String((long)epoch) + ".pcm";
}

// Read the HTTP status code from the response, drain the rest, and close.
int read_response(WiFiClient& c, uint32_t ms) {
    int      code = 0;
    uint32_t t0   = millis();
    while (c.connected() && millis() - t0 < ms) {
        if (c.available()) {
            String line = c.readStringUntil('\n'); // "HTTP/1.1 200 OK"
            int sp = line.indexOf(' ');
            if (sp > 0) code = line.substring(sp + 1).toInt();
            break;
        }
        vTaskDelay(pdMS_TO_TICKS(5));
    }
    while (c.connected() && millis() - t0 < ms) { // drain the rest
        while (c.available()) c.read();
        vTaskDelay(pdMS_TO_TICKS(5));
    }
    c.stop();
    return code;
}

bool open_audio_post(WiFiClient& c, time_t epoch, uint32_t len) {
    if (!c.connect(CLOUD_HOST, CLOUD_PORT, 4000)) return false;
    c.printf("POST %s?epoch=%ld HTTP/1.1\r\n", CLOUD_AUDIO_PATH, (long)epoch);
    c.printf("Host: %s\r\n", CLOUD_HOST);
    c.printf("X-Device-Token: %s\r\n", CLOUD_DEVICE_TOKEN);
    c.print("Content-Type: audio/wav\r\n");
    c.printf("Content-Length: %u\r\n", (unsigned)len);
    c.print("Connection: close\r\n\r\n");
    return true;
}

// Upload the finished clip file. The file on flash is raw PCM (see clips.cpp);
// the 44-byte WAV header is prepended here so the server still receives a
// complete WAV verbatim. Returns the HTTP status, 0 on connect/IO failure, or
// -1 if there is no local file (caller still posts the event).
int upload_file(time_t epoch) {
    File f = LittleFS.open(clip_path(epoch), "r");
    if (!f) return -1;
    uint32_t len = f.size();
    WiFiClient c;
    webserver_pause_ws(true);
    int code = 0;
    if (open_audio_post(c, epoch, 44 + len)) {
        uint8_t h[44];
        wav_header_16k16(h, len);
        c.write(h, 44);
        uint8_t buf[512];
        for (;;) {
            int n = f.read(buf, sizeof(buf));
            if (n <= 0) break;
            c.write(buf, n);
        }
        code = read_response(c, 3000);
    }
    webserver_pause_ws(false);
    f.close();
    return code;
}

// Stream a synthetic two-tone clip (Content-Length known up front, generated in
// small chunks so no big RAM buffer is needed). Returns the HTTP status.
int upload_synthetic(time_t epoch, uint16_t seconds) {
    const uint32_t sr   = STREAM_SAMPLE_RATE;
    const uint32_t data = seconds * sr; // 8-bit → 1 byte/sample
    WiFiClient c;
    webserver_pause_ws(true);
    int code = 0;
    if (open_audio_post(c, epoch, 44 + data)) {
        uint8_t h[44];
        wav_header8(h, data);
        c.write(h, 44);
        uint8_t  buf[256];
        uint32_t i = 0;
        while (i < data && c.connected()) {
            size_t o = 0;
            while (o < sizeof(buf) && i < data) {
                float ff = ((i / (sr / 2)) % 2) ? 900.0f : 700.0f;
                float s  = sinf(2.0f * (float)M_PI * ff * (float)i / (float)sr);
                int   v  = 128 + (int)(60.0f * s);
                buf[o++] = (uint8_t)(v < 0 ? 0 : (v > 255 ? 255 : v));
                i++;
            }
            c.write(buf, o);
            vTaskDelay(pdMS_TO_TICKS(5));
        }
        code = read_response(c, 3000);
    }
    webserver_pause_ws(false);
    return code;
}

int post_event(const Job& j) {
    WiFiClient c;
    if (!c.connect(CLOUD_HOST, CLOUD_PORT, 4000)) return 0;
    char body[160];
    int bl = snprintf(body, sizeof(body),
        "{\"epoch\":%ld,\"durationS\":%u,\"peakDb\":%.1f,\"confidence\":%.3f}",
        (long)j.epoch, (unsigned)j.dur, (double)j.db, (double)j.conf);
    c.printf("POST %s HTTP/1.1\r\n", CLOUD_EVENT_PATH);
    c.printf("Host: %s\r\n", CLOUD_HOST);
    c.printf("X-Device-Token: %s\r\n", CLOUD_DEVICE_TOKEN);
    c.print("Content-Type: application/json\r\n");
    c.printf("Content-Length: %d\r\n", bl);
    c.print("Connection: close\r\n\r\n");
    c.write((const uint8_t*)body, bl);
    return read_response(c, 3000);
}

void cloud_task(void*) {
    for (;;) {
        Job j;
        if (!xQueueReceive(g_jobs, &j, portMAX_DELAY)) continue;
        if (!host_set() || !wifi_up()) continue; // best-effort; event is in events.csv

        // Pause inference while uploading so WiFi's TCP buffers don't starve the
        // Edge Impulse DSP of heap. Let any in-flight DSP slice finish first.
        detector_pause(true);
        vTaskDelay(pdMS_TO_TICKS(50));

        int acode = j.synthetic ? upload_synthetic(j.epoch, (uint16_t)CLOUD_TEST_SECONDS)
                                : upload_file(j.epoch);
        if (acode > 0) {
            Serial.printf("Cloud: clip epoch=%ld uploaded (HTTP %d)\n", (long)j.epoch, acode);
            // Free the on-device copy now it's safely on the VPS (core-0 deletes it).
            if (!j.synthetic) {
                char nm[24];
                snprintf(nm, sizeof(nm), "%ld.pcm", (long)j.epoch);
                clips_request_remove(nm);
            }
        } else if (acode == 0) {
            Serial.printf("Cloud: clip epoch=%ld upload failed (kept locally)\n", (long)j.epoch);
        }

        int ecode = post_event(j);
        // One-shot diagnostics (no periodic spam): heap health, plus the audio &
        // cloud task stack high-water marks (min free bytes ever) so the
        // 32 KB / 6 KB stacks can be right-sized later.
        Serial.printf("Cloud: event epoch=%ld posted (HTTP %d) [heap=%u largest=%u "
                      "audioStk=%u cloudStk=%u]\n",
                      (long)j.epoch, ecode, (unsigned)ESP.getFreeHeap(),
                      (unsigned)ESP.getMaxAllocHeap(),
                      (unsigned)audio_task_stack_min(),
                      (unsigned)(uxTaskGetStackHighWaterMark(nullptr) * sizeof(StackType_t)));

        // Resume inference and reinit the continuous classifier (the rolling MFCC
        // window is stale after the pause — a clean reset avoids ghost slices).
        // Reinit while STILL paused so the audio task can't run inference on
        // core 0 while run_classifier_init() touches the same state on core 1.
        detector_reinit();
        detector_pause(false);
    }
}

} // namespace

// --- public API ------------------------------------------------------------

void cloud_init() {
    g_jobs = xQueueCreate(4, sizeof(Job));
    if (!g_jobs) {
        Serial.println("Cloud: alloc failed — uploads disabled");
        return;
    }
    xTaskCreatePinnedToCore(cloud_task, "cloud", 6144, nullptr, 1, nullptr, 1);
    Serial.printf("Cloud: %s%s:%d [free heap=%u]\n", host_set() ? "" : "(disabled) ",
                  host_set() ? CLOUD_HOST : "none", (int)CLOUD_PORT,
                  (unsigned)ESP.getFreeHeap());
}

bool cloud_enabled() { return host_set(); }

void cloud_upload_clip(time_t epoch, uint16_t duration_s, float peak_db, float confidence) {
    if (!g_jobs || !host_set()) return;
    Job j = { epoch, duration_s, peak_db, confidence, false };
    xQueueSend(g_jobs, &j, 0); // drop if backlog full (best-effort)
}

void cloud_test_clip(time_t epoch, uint16_t duration_s, float peak_db, float confidence) {
    if (!g_jobs || !host_set()) return;
    Job j = { epoch, duration_s, peak_db, confidence, true };
    xQueueSend(g_jobs, &j, 0);
}
