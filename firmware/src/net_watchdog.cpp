#include "net_watchdog.h"
#include "config.h"
#include "wifi_credentials.h"
#include "detector.h"
#include <WiFi.h>
#include "ping/ping_sock.h"

// ---------------------------------------------------------------------------
// Why this exists: under a burst of parallel/aborted HTTP transfers (a web-UI
// cold load is exactly that) the TCP/IP stack can wedge — WiFi stays
// "associated" and the firmware keeps running, but nothing answers ARP/ICMP/TCP
// anymore, permanently. Before the dedicated EI pool this state was masked
// because the DSP starved soon after and the recovery ladder rebooted the
// board; with detection now isolated from the network heap, the device would
// otherwise listen forever while being unreachable.
//
// Strategy: one persistent esp_ping session pings the gateway every
// NET_WD_PING_INTERVAL_MS (the ping runs on its own tiny task — if the stack
// is wedged the ping task may block forever, which is itself a detection:
// s_last_ok just stops advancing). loop() evaluates the silence:
//   1. >= NET_WD_RECONNECT_MS  → one WiFi disconnect/reconnect attempt.
//   2. >= NET_WD_REBOOT_MS     → controlled ESP.restart(), but never while a
//      detection event is in progress (events/clips are already on LittleFS).
// A plain WiFi drop (router down, status != WL_CONNECTED) is NOT treated as a
// wedge: Arduino auto-reconnect owns that case and detection keeps running
// offline. The watchdog also stands down entirely in fallback-AP mode.
// ---------------------------------------------------------------------------

static esp_ping_handle_t s_ping       = nullptr;
static uint32_t          s_gw         = 0;        // gateway IP the session targets
static volatile uint32_t s_last_ok    = 0;        // millis() of last ping reply
static bool              s_reconnected = false;   // stage-1 escalation fired

static void on_ping_ok(esp_ping_handle_t, void*) {
    s_last_ok = millis();
}

// (Re)create the persistent ping session whenever the gateway (re)appears or
// changes. Created while the stack is healthy, so the blocking raw-socket
// setup inside esp_ping_new_session is safe here.
static void ensure_session() {
    uint32_t gw = (uint32_t)WiFi.gatewayIP();
    if (gw == 0) return;
    if (s_ping && gw == s_gw) return;
    if (s_ping) { esp_ping_delete_session(s_ping); s_ping = nullptr; }

    esp_ping_config_t cfg = ESP_PING_DEFAULT_CONFIG();
    cfg.count      = 1;
    cfg.timeout_ms = 1500;
    cfg.target_addr.type            = IPADDR_TYPE_V4;
    cfg.target_addr.u_addr.ip4.addr = gw;

    esp_ping_callbacks_t cbs = {};
    cbs.on_ping_success = on_ping_ok;

    if (esp_ping_new_session(&cfg, &cbs, &s_ping) == ESP_OK) {
        s_gw = gw;
        Serial.printf("NetWD: pinging gateway %s every %us\n",
                      WiFi.gatewayIP().toString().c_str(),
                      (unsigned)(NET_WD_PING_INTERVAL_MS / 1000));
    } else {
        s_ping = nullptr;
    }
}

void net_watchdog_init() {
    s_last_ok = millis(); // treat boot as healthy; thresholds give the grace period
}

uint32_t net_watchdog_silence_ms() {
    return millis() - s_last_ok;
}

void net_watchdog_service() {
    // Fallback-AP mode (no STA credentials working): nothing to watch.
    if (!(WiFi.getMode() & WIFI_MODE_STA)) return;

    uint32_t now = millis();

    if (WiFi.status() == WL_CONNECTED) {
        ensure_session();
        static uint32_t last_ping = 0;
        if (s_ping && now - last_ping >= NET_WD_PING_INTERVAL_MS) {
            last_ping = now;
            esp_ping_start(s_ping); // non-blocking; reply lands in on_ping_ok
        }
    } else {
        // Driver knows the link is down — auto-reconnect owns it. Keep the
        // silence clock from escalating into a reboot loop during an outage.
        s_last_ok = now - (NET_WD_RECONNECT_MS - 1);
        return;
    }

    uint32_t silent = now - s_last_ok;

    if (silent < NET_WD_RECONNECT_MS) {
        s_reconnected = false; // healthy (again)
        return;
    }

    if (!s_reconnected) {
        // Stage 1: the link claims to be up but the gateway has been silent —
        // try a fresh association first (cheap, keeps uptime).
        s_reconnected = true;
        Serial.printf("NetWD: gateway silent for %lus — WiFi reconnect\n",
                      (unsigned long)(silent / 1000));
        WiFi.disconnect();
        WiFi.begin(WIFI_STA_SSID, WIFI_STA_PASS);
        return;
    }

    if (silent >= NET_WD_REBOOT_MS && !detector_active()) {
        // Stage 2: stack is wedged beyond a reconnect (the lockup signature).
        // A controlled reboot is the only reliable reset for lwIP/AsyncTCP;
        // events + clips are already persisted, and we never cut off an
        // in-progress detection.
        Serial.printf("NetWD: network dead for %lus — rebooting\n",
                      (unsigned long)(silent / 1000));
        Serial.flush();
        ESP.restart();
    }
}
