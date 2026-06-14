#pragma once
#include <Arduino.h>

void  detector_init();

// Called from the audio task with the current sound level and classifier inputs.
// Runs the Edge Impulse model on `samples`/`n` and drives the event state machine.
void  detector_update(float db, const int16_t* samples, size_t n);

// Latest siren-likelihood score (0..1) for live display.
float detector_score();

// True while a siren event is currently open.
bool  detector_active();

// Fast LED signal (two-stage LED): live score is siren-like (≈0.5 s confirm,
// off within one slice). Combine with detector_active() — bright flash only
// for confirmed events, dim candidate pulse before that.
bool  detector_led_active();

// Live "cat" class probability (0..1) and a thresholded flag for the UI badge.
// Display-only: cat detection never opens an event (cats aren't logged/counted).
float detector_cat_score();
bool  detector_cat_active();

// Live per-class probabilities from the last inference (cat / siren / traffic, …).
int         detector_label_count();
const char* detector_label(int i);
float       detector_class_score(int i);

// Pause/resume inference (e.g. during cloud upload to avoid heap contention).
// While paused, classify() returns 0 and discards incoming audio slices.
void  detector_pause(bool paused);

// User-facing detection toggle from the web UI (independent of the cloud-upload
// pause above). While disabled, classify() returns 0 so no events are opened.
void  detector_set_enabled(bool enabled);
bool  detector_enabled();

// Re-initialise the continuous classifier (resets the rolling MFCC window).
// Safe to call after a stream interruption (pause, OOM recovery, etc.).
void  detector_reinit();

// Injects a synthetic completed event into the log (testing without a mic).
void  detector_inject_test_event();
