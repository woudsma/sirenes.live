#pragma once
#include <stdint.h>

enum LedMode {
    LED_OFF,
    LED_WIFI,      // connecting to WiFi   (blue pulse)
    LED_LISTENING, // connected, idle      (green breathe)
    LED_CANDIDATE, // siren-like sound, not yet confirmed (dim blue pulse)
    LED_DETECTING, // confirmed siren event in progress   (bright blue flash)
    LED_PAUSED,    // detection paused     (amber breathe)
    LED_ERROR,     // fault                (red blink)
};

void leds_init();
void leds_startup_blink();
void leds_set_mode(LedMode mode);
void leds_flash(uint8_t r, uint8_t g, uint8_t b, uint16_t duration_ms = 300);

// One-shot, non-blocking pulse of the onboard blue LED (e.g. when a detection
// ends). Safe to call from another task — it just records an end time; the
// actual GPIO drive happens in leds_update().
void leds_blink_onboard(uint16_t duration_ms = 120);

void leds_update();
