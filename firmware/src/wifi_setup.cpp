#include "wifi_setup.h"
#include "config.h"
#include "wifi_credentials.h"
#include <WiFi.h>
#include <ESPmDNS.h>
#include <time.h>

void wifi_init() {
    WiFi.mode(WIFI_STA);
    // Modem-sleep OFF: with it on, large transfers (the ~248 KB UI bundle)
    // stalled mid-flight under concurrent traffic and could wedge lwIP/AsyncTCP
    // (see net_watchdog.cpp). Costs ~0.3-0.5 W extra — reliability over power
    // for an always-on detector.
    WiFi.setSleep(false);
    WiFi.setAutoReconnect(true);
    WiFi.begin(WIFI_STA_SSID, WIFI_STA_PASS);

    Serial.printf("Connecting to %s", WIFI_STA_SSID);
    uint32_t start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < STA_TIMEOUT_MS) {
        delay(250);
        Serial.print(".");
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.printf("\nConnected! IP: %s\n", WiFi.localIP().toString().c_str());
        if (MDNS.begin(MDNS_HOSTNAME)) {
            MDNS.addService("http", "tcp", 80);
            Serial.printf("mDNS: http://%s.local\n", MDNS_HOSTNAME);
        }
        // Kick off NTP; configTzTime applies the DST-aware timezone string.
        configTzTime(TZ_INFO, NTP_SERVER_1, NTP_SERVER_2);
        Serial.println("NTP sync requested...");
    } else {
        Serial.println("\nWiFi failed — starting fallback AP");
        WiFi.mode(WIFI_AP);
        WiFi.softAP(AP_SSID, AP_PASS);
        Serial.printf("AP: %s  IP: %s\n", AP_SSID, WiFi.softAPIP().toString().c_str());
    }
}

bool wifi_is_connected() {
    return WiFi.status() == WL_CONNECTED;
}

bool wifi_time_valid() {
    time_t now = time(nullptr);
    return now > 1609459200; // 2021-01-01
}
