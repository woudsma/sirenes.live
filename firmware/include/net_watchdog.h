#pragma once
#include <Arduino.h>

// Network-stack watchdog (see net_watchdog.cpp). Detects the "WiFi associated
// but no traffic flows" wedge (lwIP/AsyncTCP lockup under load) by pinging the
// gateway, and escalates: WiFi reconnect, then a controlled reboot once no
// detection is in progress. Without it the device can stay unreachable forever
// while listening happily — fatal for an always-on, headless device.
void net_watchdog_init();

// Call from loop(). Cheap (time checks only) except when escalating.
void net_watchdog_service();

// Milliseconds since the gateway last answered a ping (diagnostics).
uint32_t net_watchdog_silence_ms();
