#include "leds.h"
#include "pins.h"
#include <FastLED.h>

// The XIAO ESP32S3 onboard user LED (GPIO21) is active-LOW: drive LOW to light it.
static constexpr uint8_t ONBOARD_ON  = LOW;
static constexpr uint8_t ONBOARD_OFF = HIGH;

// One-shot "detection uploaded" sweep: a purple-ish blue that ramps 0 → peak
// over UPLOAD_SWEEP_MS. Red is kept well below blue so the hue reads blue-violet,
// not magenta; both channels ramp together so only the brightness sweeps.
static constexpr uint8_t  UPLOAD_SWEEP_MAX_BLUE = 100;
static constexpr uint8_t  UPLOAD_SWEEP_MAX_RED  = 40;
static constexpr uint32_t UPLOAD_SWEEP_MS       = 750;

static CRGB     leds_data[LED_COUNT];
static LedMode  current_mode = LED_OFF;
static uint32_t flash_end    = 0;
static CRGB     flash_color;
static volatile uint32_t onboard_off  = 0; // onboard LED held ON until this millis()
static volatile uint32_t sweep_start  = 0; // upload sweep start millis (0 = inactive)

void leds_init() {
    pinMode(PIN_LED_BUILTIN, OUTPUT);
    digitalWrite(PIN_LED_BUILTIN, ONBOARD_OFF);
    // APA106: WS2812-compatible single-wire protocol, but native color order
    // is RGB (not GRB like the WS2812). Using the APA106 chipset sets both the
    // correct timing and color order so CRGB(r,g,b) maps to the right channels.
    FastLED.addLeds<APA106, PIN_LEDS, RGB>(leds_data, LED_COUNT);
    FastLED.setBrightness(40); // dim — status only, keeps current tiny
    fill_solid(leds_data, LED_COUNT, CRGB::Black);
    FastLED.show();
}

void leds_startup_blink() {
    // Blink the onboard LED 5 times on boot (also pulse the WS2812 white).
    for (int i = 0; i < 5; i++) {
        digitalWrite(PIN_LED_BUILTIN, ONBOARD_ON);
        fill_solid(leds_data, LED_COUNT, CRGB::White);
        FastLED.show();
        delay(60);
        digitalWrite(PIN_LED_BUILTIN, ONBOARD_OFF);
        fill_solid(leds_data, LED_COUNT, CRGB::Black);
        FastLED.show();
        delay(60);
    }
}

void leds_set_mode(LedMode mode) {
    current_mode = mode;
}

void leds_flash(uint8_t r, uint8_t g, uint8_t b, uint16_t duration_ms) {
    flash_color = CRGB(r, g, b);
    flash_end   = millis() + duration_ms;
}

void leds_blink_onboard(uint16_t duration_ms) {
    onboard_off = millis() + duration_ms;
}

void leds_upload_sweep() {
    sweep_start = millis();
}

void leds_update() {
    // Drive the onboard user LED for any pending one-shot pulse (non-blocking).
    digitalWrite(PIN_LED_BUILTIN, (millis() < onboard_off) ? ONBOARD_ON : ONBOARD_OFF);

    if (millis() < flash_end) {
        fill_solid(leds_data, LED_COUNT, flash_color);
        FastLED.show();
        return;
    }

    // One-shot upload sweep: a purple-ish blue ramps 0 → peak over
    // UPLOAD_SWEEP_MS when a detection reaches the server. Overrides the steady
    // mode so the blip is always visible; stays under the global brightness cap.
    if (sweep_start) {
        uint32_t e = millis() - sweep_start;
        if (e < UPLOAD_SWEEP_MS) {
            uint8_t b = (uint8_t)((uint32_t)UPLOAD_SWEEP_MAX_BLUE * e / UPLOAD_SWEEP_MS);
            uint8_t r = (uint8_t)((uint32_t)UPLOAD_SWEEP_MAX_RED  * e / UPLOAD_SWEEP_MS);
            fill_solid(leds_data, LED_COUNT, CRGB(r, 0, b));
            FastLED.show();
            return;
        }
        sweep_start = 0;
    }

    uint32_t t = millis();
    switch (current_mode) {
        case LED_OFF:
            fill_solid(leds_data, LED_COUNT, CRGB::Black);
            break;
        case LED_WIFI: { // rainbow sweep while connecting to WiFi (~3 s/loop)
            fill_solid(leds_data, LED_COUNT, CHSV(beat8(20), 255, 255));
            break;
        }
        case LED_LISTENING: // static green
            fill_solid(leds_data, LED_COUNT, CRGB(0, 60, 0));
            break;
        case LED_CANDIDATE: { // subtle dim blue pulse: siren-like, not yet confirmed
            uint8_t v = beatsin8(30, 4, 50);
            fill_solid(leds_data, LED_COUNT, CRGB(0, 0, v));
            break;
        }
        case LED_DETECTING: { // fast bright blue flash (Dutch emergency blue):
            // only shown once the event is confirmed, i.e. it WILL be logged
            uint8_t v = beatsin8(180, 80, 255);
            fill_solid(leds_data, LED_COUNT, CRGB(0, 0, v));
            break;
        }
        case LED_PAUSED: { // slow amber breathe — detection intentionally off
            uint8_t v = beatsin8(10, 4, 50);
            fill_solid(leds_data, LED_COUNT, CRGB(v, v / 2, 0));
            break;
        }
        case LED_ERROR: { // red blink
            bool on = (t / 250) % 2 == 0;
            fill_solid(leds_data, LED_COUNT, on ? CRGB::Red : CRGB::Black);
            break;
        }
    }
    FastLED.show();
}
