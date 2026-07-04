#pragma once
#include <Arduino.h>

// --- I2S microphone (Adafruit ICS-43434) ---
// Seeed XIAO ESP32S3 pads. Grouped at the bottom-right, next to the 3V3/GND
// power pads, with D10/GPIO9 left empty as a spacer between the power line and
// the mic (easier hand-soldering). DATA sits on GPIO44 (the UART0-RX pad, free
// because the console runs over native USB-CDC). Mic VDD -> 3V3 (3.3 V part).
// Mic SEL -> GND selects the LEFT channel (ONLY_LEFT in audio.cpp).
constexpr uint8_t PIN_I2S_BCLK = 8;  // bit clock   (mic SCK), pad D9
constexpr uint8_t PIN_I2S_WS   = 7;  // word select (mic WS),  pad D8
constexpr uint8_t PIN_I2S_DATA = 44; // data in     (mic SD),  pad D7

// --- APA106 status LED (single addressable pixel, WS2812-compatible) ---
// Pad D0/GPIO1, top-left corner — far from the mic pads for solder clearance.
// LED VDD -> 5V (WS2812/APA106 is a 5 V part; a single pixel accepts the 3.3 V
// data line from GPIO1).
constexpr uint8_t PIN_LEDS  = 1;
constexpr uint8_t LED_COUNT = 1;

// --- Onboard user LED (XIAO ESP32S3) ---
// GPIO21, ACTIVE-LOW (LOW = on) — see leds.cpp (ONBOARD_ON / ONBOARD_OFF).
constexpr uint8_t PIN_LED_BUILTIN = 21;
