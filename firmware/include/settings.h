#pragma once
#include <Arduino.h>

// Runtime-tunable settings, persisted to /settings.json on LittleFS.
// Defaults come from config.h; the Settings page edits these live.
struct Settings {
    float    cal_offset_db; // dB SPL calibration offset (tuned in M1)
    float    score_on;      // classifier score to open an event
    float    score_off;     // classifier score to close an event
    uint32_t min_ms;        // minimum sustained time to count as a siren
};

extern Settings g_settings;

void   settings_init();                       // load from flash or apply defaults
bool   settings_save();                       // persist to /settings.json
String settings_json();                        // serialize current settings
bool   settings_apply_json(const String& body); // merge incoming JSON, then save
