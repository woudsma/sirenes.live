#include "webserver.h"
#include "events.h"
#include "settings.h"
#include "config.h"
#include "record.h"
#include "detector.h"
#include "wav_format.h"
#include <ESPAsyncWebServer.h>
#include <LittleFS.h>
#include <memory>

static AsyncWebServer server(80);
static AsyncWebSocket ws("/ws");

static volatile bool flag_sim_event = false;

// Heap guard for the data API endpoints. The async server builds each JSON
// response as a String AND copies it into the response buffer, then allocates
// header-list nodes — all from the system heap. When the browser loads the UI it
// fires /api/stats + /api/events + /api/config + a WebSocket at once, WHILE the
// (large, gzipped) JS bundle is still queued in AsyncTCP's send buffers. If the
// heap is momentarily too low, ESPAsyncWebServer's operator new throws bad_alloc
// while assembling the response — uncaught inside the library, that reboots the
// board. So we shed load instead: if free heap or the largest contiguous block
// is below a safe margin, return 503 (a tiny response) and let the UI retry a
// moment later once the bundle has finished sending and the heap recovers.
static const uint32_t API_MIN_FREE_HEAP  = 40000; // total free bytes required
static const uint32_t API_MIN_LARGEST    = 18000; // largest contiguous block required

static bool heap_too_low() {
    return ESP.getFreeHeap() < API_MIN_FREE_HEAP ||
           ESP.getMaxAllocHeap() < API_MIN_LARGEST;
}

// Returns true (and sends a 503) when the heap is too low to build a response
// safely; the caller should just return. Keeps the heavy endpoints from aborting
// the board under the initial-load heap spike.
static bool reject_if_low_heap(AsyncWebServerRequest* req) {
    if (!heap_too_low()) return false;
    Serial.printf("API 503 (low heap): free=%u largest=%u %s\n",
                  (unsigned)ESP.getFreeHeap(), (unsigned)ESP.getMaxAllocHeap(),
                  req->url().c_str());
    req->send(503, "application/json", "{\"error\":\"busy\"}");
    return true;
}

// True while a large file download is streaming. The 5 Hz WS broadcast is paused
// for the duration: a download runs the heap to the edge, and ws.textAll()'s
// buffer alloc would race it and abort the device (bad_alloc → terminate). Set
// when the download starts, cleared at EOF / on disconnect, with a timeout
// backstop so a dropped connection can never pause the WS forever.
static volatile bool     g_download_active = false;
static volatile uint32_t g_download_start_ms = 0;
static volatile uint32_t g_download_end_ms = 0; // for the post-download WS cool-down

// Same idea as g_download_active, but set by the cloud upload task (core 1) while
// it POSTs a clip, so the 5 Hz broadcast's allocations don't race the transfer.
static volatile bool     g_upload_active   = false;
static volatile uint32_t g_upload_start_ms = 0;

static void onWsEvent(AsyncWebSocket*, AsyncWebSocketClient*,
                      AwsEventType, void*, uint8_t*, size_t) {
    // The UI is read-only over WS for now; status is pushed from the main loop.
}

void webserver_init() {
    ws.onEvent(onWsEvent);
    server.addHandler(&ws);

    // --- API ---
    server.on("/api/stats", HTTP_GET, [](AsyncWebServerRequest* req) {
        if (reject_if_low_heap(req)) return;
        req->send(200, "application/json", events_stats_json());
    });

    server.on("/api/events", HTTP_GET, [](AsyncWebServerRequest* req) {
        if (reject_if_low_heap(req)) return;
        uint32_t limit  = 50, offset = 0;
        if (req->hasParam("limit"))  limit  = req->getParam("limit")->value().toInt();
        if (req->hasParam("offset")) offset = req->getParam("offset")->value().toInt();
        req->send(200, "application/json", events_json(limit, offset));
    });

    // Delete one event by start epoch (?ts=...), or the whole log if ts is omitted.
    server.on("/api/events", HTTP_DELETE, [](AsyncWebServerRequest* req) {
        if (req->hasParam("ts")) {
            time_t ts = (time_t)req->getParam("ts")->value().toInt();
            bool ok = events_delete(ts);
            req->send(ok ? 200 : 404, "application/json",
                      ok ? "{\"ok\":true}" : "{\"ok\":false,\"error\":\"not found\"}");
        } else {
            events_clear();
            req->send(200, "application/json", "{\"ok\":true}");
        }
    });

    server.on("/api/events.csv", HTTP_GET, [](AsyncWebServerRequest* req) {
        if (LittleFS.exists(events_csv_path()))
            req->send(LittleFS, events_csv_path(), "text/csv");
        else
            req->send(200, "text/csv", "");
    });

    // --- M2 data collection: record a labeled WAV ---
    server.on("/api/record/start", HTTP_POST, [](AsyncWebServerRequest* req) {
        String label = req->hasParam("label") ? req->getParam("label")->value() : String("sample");
        bool ok = record_start(label.c_str());
        req->send(ok ? 200 : 409, "application/json",
                  ok ? "{\"ok\":true}" : "{\"ok\":false,\"error\":\"busy or fs error\"}");
    });
    server.on("/api/record/stop", HTTP_POST, [](AsyncWebServerRequest* req) {
        record_stop();
        char buf[96];
        snprintf(buf, sizeof(buf), "{\"ok\":true,\"seconds\":%lu,\"label\":\"%s\"}",
                 (unsigned long)record_seconds(), record_label());
        req->send(200, "application/json", buf);
    });
    server.on("/api/record/status", HTTP_GET, [](AsyncWebServerRequest* req) {
        char buf[160];
        snprintf(buf, sizeof(buf),
                 "{\"recording\":%s,\"seconds\":%lu,\"label\":\"%s\",\"maxSeconds\":%u,"
                 "\"hasFile\":%s,\"freeBytes\":%lu,\"startedAt\":%lu}",
                 record_active() ? "true" : "false", (unsigned long)record_seconds(),
                 record_label(), REC_MAX_SECONDS,
                 LittleFS.exists(record_path()) ? "true" : "false",
                 (unsigned long)record_free_bytes(),
                 (unsigned long)record_timestamp());
        req->send(200, "application/json", buf);
    });
    server.on("/api/record/download", HTTP_GET, [](AsyncWebServerRequest* req) {
        if (record_active()) { req->send(409, "text/plain", "still recording"); return; }
        if (!LittleFS.exists(record_path())) { req->send(404, "text/plain", "no recording"); return; }
        auto file = std::make_shared<fs::File>(LittleFS.open(record_path(), "r"));
        if (!*file) { req->send(500, "text/plain", "open failed"); return; }
        // <label>.<unix timestamp>.wav so downloads don't need renaming for Edge Impulse.
        // Fall back to just <label>.wav if NTP hasn't synced (timestamp 0).
        uint32_t ts = record_timestamp();
        String name = ts ? String(record_label()) + "." + String(ts) + ".wav"
                         : String(record_label()) + ".wav";
        // Stream in chunks and pause the WS broadcast for the duration (see
        // g_download_active). The filler returning 0 at EOF marks completion.
        // The file on flash is raw PCM; the WAV header is prepended here (the
        // first 44 bytes of the response) — see wav_format.h for why.
        g_download_active   = true;
        g_download_start_ms = millis();
        uint32_t dataBytes = file->size();
        AsyncWebServerResponse* res = req->beginChunkedResponse("audio/wav",
            [file, dataBytes](uint8_t* buf, size_t maxLen, size_t index) -> size_t {
                if (maxLen == 0) return 0;
                size_t out = 0;
                if (index < 44) { // serve (the rest of) the synthesized header
                    uint8_t h[44];
                    wav_header_16k16(h, dataBytes);
                    out = 44 - index < maxLen ? 44 - index : maxLen;
                    memcpy(buf, h + index, out);
                    if (out == maxLen) return out;
                }
                size_t n = file->read(buf + out, maxLen - out);
                if (n == 0 && out == 0) {
                    file->close();
                    g_download_active = false;
                    g_download_end_ms = millis();
                    record_request_delete(); // free the clip now that it's downloaded
                } // EOF
                return out + n;
            });
        res->addHeader("Content-Disposition", "attachment; filename=\"" + name + "\"");
        req->onDisconnect([]() { g_download_active = false; g_download_end_ms = millis(); }); // mid-stream abort
        req->send(res);
    });

    // Serve a detection's audio clip: /api/clip?f=<name>. The filename is
    // sanitized to a bare basename so it cannot escape the clips directory.
    // Clips are stored as raw PCM; the WAV header is prepended on the fly
    // (same scheme as the record download — see wav_format.h).
    server.on("/api/clip", HTTP_GET, [](AsyncWebServerRequest* req) {
        if (!req->hasParam("f")) { req->send(400, "text/plain", "missing f"); return; }
        String f = req->getParam("f")->value();
        if (f.indexOf('/') >= 0 || f.indexOf("..") >= 0) { req->send(400, "text/plain", "bad name"); return; }
        String path = String(CLIPS_DIR) + "/" + f;
        if (!f.endsWith(".pcm") || !LittleFS.exists(path)) { req->send(404, "text/plain", "no clip"); return; }
        auto file = std::make_shared<fs::File>(LittleFS.open(path, "r"));
        if (!*file) { req->send(500, "text/plain", "open failed"); return; }
        uint32_t dataBytes = file->size();
        AsyncWebServerResponse* res = req->beginChunkedResponse("audio/wav",
            [file, dataBytes](uint8_t* buf, size_t maxLen, size_t index) -> size_t {
                if (maxLen == 0) return 0;
                size_t out = 0;
                if (index < 44) {
                    uint8_t h[44];
                    wav_header_16k16(h, dataBytes);
                    out = 44 - index < maxLen ? 44 - index : maxLen;
                    memcpy(buf, h + index, out);
                    if (out == maxLen) return out;
                }
                size_t n = file->read(buf + out, maxLen - out);
                if (n == 0 && out == 0) file->close(); // EOF
                return out + n;
            });
        req->send(res);
    });

    server.on("/api/sim/event", HTTP_POST, [](AsyncWebServerRequest* req) {
        flag_sim_event = true;
        req->send(200, "application/json", "{\"ok\":true}");
    });

    // Pause/resume detection from the UI: POST /api/detect?on=true|false. Just
    // flips a flag in the detector (audio task), so it's safe to call here.
    server.on("/api/detect", HTTP_POST, [](AsyncWebServerRequest* req) {
        bool enabled = true;
        if (req->hasParam("on")) {
            String v = req->getParam("on")->value();
            enabled = (v == "true" || v == "1");
        }
        detector_set_enabled(enabled);
        req->send(200, "application/json",
                  enabled ? "{\"enabled\":true}" : "{\"enabled\":false}");
    });

    server.on("/api/config", HTTP_GET, [](AsyncWebServerRequest* req) {
        if (reject_if_low_heap(req)) return;
        req->send(200, "application/json", settings_json());
    });
    server.on("/api/config", HTTP_POST,
        [](AsyncWebServerRequest* req) {
            String* buf = (String*)req->_tempObject;
            bool ok = buf && settings_apply_json(*buf);
            if (buf) { delete buf; req->_tempObject = nullptr; }
            req->send(ok ? 200 : 400, "application/json",
                      ok ? settings_json() : "{\"ok\":false}");
        },
        nullptr,
        [](AsyncWebServerRequest* req, uint8_t* data, size_t len, size_t index, size_t total) {
            if (index == 0) { req->_tempObject = new String(); ((String*)req->_tempObject)->reserve(total); }
            ((String*)req->_tempObject)->concat((const char*)data, len);
        });

    // --- Static UI (gzipped files in /data) ---
    // Last-Modified = firmware build time + "no-cache": the browser revalidates
    // every load and gets a tiny 304 instead of re-downloading the ~248 KB
    // bundle. That transfer is the single heaviest thing this server does (it
    // triggered the lwIP/AsyncTCP wedge the net watchdog guards against), so
    // serving it once per flash instead of once per page load matters.
    {
        struct tm tm = {};
        strptime(__DATE__ " " __TIME__, "%b %d %Y %H:%M:%S", &tm);
        server.serveStatic("/", LittleFS, "/")
              .setDefaultFile("index.html")
              .setCacheControl("no-cache")
              .setLastModified(mktime(&tm));
    }

    server.onNotFound([](AsyncWebServerRequest* req) {
        req->send(404, "text/plain", "not found");
    });

    server.begin();
    Serial.println("Web server started on port 80");
}

void webserver_broadcast_status(const char* json) {
    // Reap dead clients AND cap the live ones at 2 (oldest closed first): each
    // client holds a message queue that can pin heap while it's backed up, and
    // this is a single-user device — a forgotten extra tab shouldn't be able
    // to accumulate queued status frames.
    ws.cleanupClients(2);

    // Pause entirely while a file download streams — ws.textAll()'s alloc would
    // race the download for the last of the heap and abort (bad_alloc). The
    // timeout backstop guarantees a dropped download can't freeze the WS forever.
    if (g_download_active) {
        if (millis() - g_download_start_ms > 20000) g_download_active = false;
        else return;
    }
    // Likewise pause while the cloud task uploads a clip (30 s backstop in case the
    // upload stalls, so it can never freeze the broadcast forever).
    if (g_upload_active) {
        if (millis() - g_upload_start_ms > 30000) g_upload_active = false;
        else return;
    }
    // Stay paused for a cool-down after the download so the heap (and its TCP
    // buffers) can recover before we start allocating WS message buffers again.
    if (millis() - g_download_end_ms < WS_DOWNLOAD_COOLDOWN_MS) return;
    // Don't pile messages into a backed-up client (keeps the queue bounded).
    if (!ws.availableForWriteAll()) return;
    // Skip the frame while the heap is low (e.g. during the initial UI load, when
    // the JS bundle + several API responses are in flight). The status push is
    // the most disposable allocation here — dropping a frame is invisible, but
    // competing for the last of the heap risks aborting an API response.
    if (heap_too_low()) return;

    // Guarantee: ws.textAll() allocates a message buffer, and if the heap is
    // momentarily exhausted (a download grabbing it right after the checks above)
    // operator new throws bad_alloc. Uncaught, that reaches std::terminate and
    // reboots the board. Catch it and drop this status frame instead — a missed
    // frame is invisible; a reboot is not. (-fexceptions is on for this platform.)
    try {
        ws.textAll(json);
    } catch (...) {
        // heap momentarily exhausted — skip this frame
    }
}

void webserver_pause_ws(bool paused) {
    if (paused) {
        g_upload_active   = true;
        g_upload_start_ms = millis();
    } else {
        g_upload_active   = false;
        g_download_end_ms = millis(); // reuse the post-transfer cool-down
    }
}

bool webserver_cmd_sim_event() {
    if (flag_sim_event) { flag_sim_event = false; return true; }
    return false;
}

size_t webserver_ws_count() {
    return ws.count();
}
