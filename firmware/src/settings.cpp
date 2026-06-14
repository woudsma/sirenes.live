#include "settings.h"
#include "config.h"
#include <LittleFS.h>
#include <ArduinoJson.h>

static const char* SETTINGS_PATH = "/settings.json";

Settings g_settings = {
    CAL_OFFSET_DB,
    DETECT_SCORE_ON,
    DETECT_SCORE_OFF,
    DETECT_MIN_MS,
};

void settings_init() {
    File f = LittleFS.open(SETTINGS_PATH, "r");
    if (!f) return; // keep defaults
    JsonDocument doc;
    if (deserializeJson(doc, f) == DeserializationError::Ok) {
        g_settings.cal_offset_db = doc["cal_offset_db"] | g_settings.cal_offset_db;
        g_settings.score_on      = doc["score_on"]      | g_settings.score_on;
        g_settings.score_off     = doc["score_off"]     | g_settings.score_off;
        g_settings.min_ms        = doc["min_ms"]        | g_settings.min_ms;
    }
    f.close();
}

bool settings_save() {
    File f = LittleFS.open(SETTINGS_PATH, "w");
    if (!f) return false;
    JsonDocument doc;
    doc["cal_offset_db"] = g_settings.cal_offset_db;
    doc["score_on"]      = g_settings.score_on;
    doc["score_off"]     = g_settings.score_off;
    doc["min_ms"]        = g_settings.min_ms;
    serializeJson(doc, f);
    f.close();
    return true;
}

String settings_json() {
    JsonDocument doc;
    doc["cal_offset_db"] = g_settings.cal_offset_db;
    doc["score_on"]      = g_settings.score_on;
    doc["score_off"]     = g_settings.score_off;
    doc["min_ms"]        = g_settings.min_ms;
    String out;
    serializeJson(doc, out);
    return out;
}

bool settings_apply_json(const String& body) {
    JsonDocument doc;
    if (deserializeJson(doc, body) != DeserializationError::Ok) return false;
    g_settings.cal_offset_db = doc["cal_offset_db"] | g_settings.cal_offset_db;
    g_settings.score_on      = doc["score_on"]      | g_settings.score_on;
    g_settings.score_off     = doc["score_off"]     | g_settings.score_off;
    g_settings.min_ms        = doc["min_ms"]        | g_settings.min_ms;
    return settings_save();
}
