#pragma once
#include <Arduino.h>

// --- I2S microphone (Adafruit ICS-43434) ---
// All on the breadboard's bottom row (the 3V3/GND side); avoids the USB UART
// (GPIO1/3) and the strapping pins (GPIO2/5/15). Mic SEL -> GND = LEFT channel.
constexpr uint8_t PIN_I2S_BCLK = 16; // bit clock   (mic SCK),  board label RX2
constexpr uint8_t PIN_I2S_WS   = 17; // word select (mic WS),   board label TX2
constexpr uint8_t PIN_I2S_DATA = 18; // data in     (mic SD),   board label D18

// --- APA106 status LED (single addressable pixel, WS2812-compatible) ---
constexpr uint8_t PIN_LEDS  = 4;
constexpr uint8_t LED_COUNT = 1;

// --- Onboard blue LED (ESP32 DevKit) ---
constexpr uint8_t PIN_LED_BUILTIN = 2;
