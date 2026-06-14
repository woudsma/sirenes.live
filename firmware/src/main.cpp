#include <Arduino.h>
#include <LittleFS.h>
#include <esp_bt.h>
#include "config.h"
#include "pins.h"
#include "wifi_setup.h"
#include "net_watchdog.h"
#include "settings.h"
#include "leds.h"
#include "events.h"
#include "clips.h"
#include "record.h"
#include "audio.h"
#include "detector.h"
#include "ei_pool.h"
#include "cloud.h"
#include "webserver.h"

static const uint32_t STATUS_INTERVAL_MS = 500; // 2 Hz WS broadcast (was 5 Hz —
// halves the steady allocation churn; live values don't need to be real-time)
static uint32_t last_broadcast = 0;

// LittleFS usage changes slowly and usedBytes() walks the block map, so cache it
// and refresh only every few seconds rather than on every 5 Hz broadcast.
static uint32_t g_fs_total = 0, g_fs_used = 0, g_fs_check = 0;
static void refresh_fs_usage() {
    uint32_t now = millis();
    if (g_fs_total == 0 || now - g_fs_check >= 5000) {
        g_fs_total = LittleFS.totalBytes();
        g_fs_used  = LittleFS.usedBytes();
        g_fs_check = now;
    }
}

static void broadcast_status() {
    refresh_fs_usage();
    char buf[384];
    snprintf(buf, sizeof(buf),
        "{\"type\":\"status\",\"db\":%.1f,\"score\":%.2f,\"detecting\":%s,\"paused\":%s,"
        "\"catScore\":%.2f,\"cat\":%s,"
        "\"today\":%lu,\"total\":%lu,\"uptimeS\":%lu,\"timeValid\":%s,\"host\":\"%s.local\","
        "\"freeHeap\":%lu,\"heapSize\":%lu,\"fsUsed\":%lu,\"fsTotal\":%lu}",
        audio_get_db(),
        detector_score(),
        detector_active() ? "true" : "false",
        detector_enabled() ? "false" : "true",
        detector_cat_score(),
        detector_cat_active() ? "true" : "false",
        (unsigned long)events_count_today(),
        (unsigned long)events_total(),
        (unsigned long)(millis() / 1000UL),
        wifi_time_valid() ? "true" : "false",
        MDNS_HOSTNAME,
        (unsigned long)ESP.getFreeHeap(),
        (unsigned long)ESP.getHeapSize(),
        (unsigned long)g_fs_used,
        (unsigned long)g_fs_total);
    webserver_broadcast_status(buf);
}

void setup() {
    Serial.begin(115200);
    Serial.printf("\n\n=== Siren Detector v%s ===\n", FW_VERSION);

    // Bluetooth is unused — hand its controller RAM back to the heap before any
    // allocations (EI arena, WiFi/lwIP buffers) so the freed region is usable.
    // The BT stack is never inited, so this only releases reserved memory.
    if (esp_bt_controller_mem_release(ESP_BT_MODE_BTDM) == ESP_OK)
        Serial.printf("BT RAM released [free heap=%u]\n", (unsigned)ESP.getFreeHeap());

    // maxOpenFiles=20 (default is 10). Loading the web UI opens index.html + the
    // JS/CSS bundle + fires /api/stats, /api/events and /api/config at once, and
    // the async server holds each file open for the whole chunked transfer. With
    // only 10 descriptors that briefly exhausts LittleFS ("Unable to allocate FD")
    // and a failed open inside the static-file path aborts the board. 20 gives
    // ample concurrency headroom (each FD is a small struct; we have ~140 KB free).
    if (!LittleFS.begin(true, "/littlefs", 20))
        Serial.println("ERROR: LittleFS mount failed");
    leds_init();
    leds_set_mode(LED_WIFI);

    settings_init();
    wifi_init();
    net_watchdog_init();
    events_init();
    clips_init();
    record_init();
    ei_pool_init();  // MUST precede detector_init(): run_classifier_init()'s
                     // persistent allocations have to land in the EI pool
    detector_init();
    cloud_init();   // streams detection audio + events to the VPS (needs WiFi)
    audio_init();
    webserver_init();

    audio_start_task();

    leds_startup_blink();
    leds_set_mode(wifi_is_connected() ? LED_LISTENING : LED_ERROR);
    Serial.println("Ready.");
}

void loop() {
    // LED reflects current state. Two-stage detection feedback: a dim blue
    // "candidate" pulse ~0.5 s after the score turns siren-like, the bright
    // blue flash only once the event is confirmed (≥ min_ms — it WILL be
    // logged), and back to green within ~250 ms of the siren stopping (the
    // event itself still closes via the hang timeout in the background).
    if (!wifi_is_connected())      leds_set_mode(LED_ERROR);
    else if (!detector_enabled())  leds_set_mode(LED_PAUSED);
    else if (detector_active() && detector_led_active()) leds_set_mode(LED_DETECTING);
    else if (detector_led_active()) leds_set_mode(LED_CANDIDATE);
    else                           leds_set_mode(LED_LISTENING);
    leds_update();

    // Test hook: inject a synthetic siren event from the web UI.
    if (webserver_cmd_sim_event()) {
        detector_inject_test_event();
        leds_flash(180, 0, 180);
    }

    uint32_t now = millis();
    if (now - last_broadcast >= STATUS_INTERVAL_MS) {
        last_broadcast = now;
        broadcast_status();
    }

    net_watchdog_service();

    // Heap diagnostic: sample every loop pass (~5 ms) so transient dips (UI cold
    // load, uploads) are caught, but print only a 10 s summary line. winMin is
    // the lowest free heap seen since the previous line — the number that tells
    // us how much headroom a UI load / upload actually needs.
    static uint32_t heap_win_min   = UINT32_MAX;
    static uint32_t last_heap_line = 0;
    uint32_t freeHeap = ESP.getFreeHeap();
    if (freeHeap < heap_win_min) heap_win_min = freeHeap;
    if (now - last_heap_line >= 10000) {
        last_heap_line = now;
        Serial.printf("HEAP free=%u largest=%u winMin=%u minEver=%u ws=%u | "
                      "EIpool free=%u low=%u fb=%u\n",
                      (unsigned)freeHeap, (unsigned)ESP.getMaxAllocHeap(),
                      (unsigned)heap_win_min, (unsigned)ESP.getMinFreeHeap(),
                      (unsigned)webserver_ws_count(),
                      (unsigned)ei_pool_free(), (unsigned)ei_pool_low_water(),
                      (unsigned)ei_pool_fallbacks());
        heap_win_min = UINT32_MAX;
    }

    delay(5);
}
