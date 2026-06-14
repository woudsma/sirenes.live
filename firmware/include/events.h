#pragma once
#include <Arduino.h>
#include <time.h>

struct SirenEvent {
    time_t   epoch;       // event start (unix time)
    uint16_t duration_s;  // seconds the siren was audible
    float    peak_db;     // loudest dB SPL during the event
    float    confidence;  // classifier confidence 0..1
    char     clip[24];    // clip filename (e.g. "1717.pcm") or "" if none
};

void events_init();

// Append an event to the LittleFS CSV log. Returns false on write failure.
bool events_add(const SirenEvent& e);

// Delete the event(s) whose start epoch == `epoch`, plus their clip files.
// Returns true if at least one row was removed.
bool events_delete(time_t epoch);

// Delete the whole event log and every saved clip.
void events_clear();

uint32_t events_total();        // total events in the log
uint32_t events_count_today();  // events since local midnight

// Newest-first page of events as a JSON string:
//   {"total":N,"events":[{"ts":..,"durationS":..,"peakDb":..,"confidence":..}, ...]}
String events_json(uint32_t limit, uint32_t offset);

// Aggregated stats as JSON:
//   {"today":..,"total":..,"perDay":[{"date":"YYYY-MM-DD","count":..,"peakDb":..}],
//    "perHour":[24 ints],"dbHistogram":[{"bin":"60","count":..}]}
String events_stats_json();

const char* events_csv_path();
