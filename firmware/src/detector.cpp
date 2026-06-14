#include "detector.h"
#include "config.h"
#include "events.h"
#include "settings.h"
#include "clips.h"
#include "cloud.h"
#include "leds.h"
#include <time.h>
#include <woudsma-project-1_inferencing.h>

// ---------------------------------------------------------------------------
// Siren event state machine + Edge Impulse inference (M3). The audio task feeds
// us 16-bit PCM in ~1024-sample frames; we accumulate them into 250 ms slices
// and run the model in continuous mode (run_classifier_continuous keeps a
// rolling 1 s MFCC window across slices). `classify()` returns the model's
// "siren" probability (0..1), which drives the ON/OFF state machine below.
// The dB SPL meter (passed in as `db`) is independent and gives per-event peak
// loudness. The same AUDIO_PCM_SHIFT gain was applied to the training clips, so
// live audio matches what the model saw.
// ---------------------------------------------------------------------------

static volatile float g_score  = 0.0f;
static volatile bool  g_active = false;

// --- Edge Impulse continuous inference state ---
static float  g_slice[EI_CLASSIFIER_SLICE_SIZE]; // one 250 ms slice of float audio
static size_t g_slice_fill  = 0;
static float  g_last_score  = 0.0f;              // held between slice inferences
static bool   g_ei_ready    = false;
static int    g_siren_index = 0;                 // resolved from labels at init
static int    g_cat_index   = -1;                // resolved from labels at init (-1 if absent)
static float  g_scores[EI_CLASSIFIER_LABEL_COUNT] = { 0 }; // latest per-class probabilities

// --- Pause / OOM-recovery state ---
static volatile bool g_paused          = false;  // set by detector_pause() (cloud upload)
static volatile bool g_user_paused     = false;  // set by detector_set_enabled() (web UI toggle)
static uint16_t      g_ei_errors       = 0;      // consecutive DSP failures
static uint32_t      g_last_recover_ms = 0;      // rate-limit recovery attempts
static uint8_t       g_recover_tries   = 0;      // reinit attempts since last healthy inference

// Continuous classifier reads the just-collected slice through this callback.
static int slice_get_data(size_t offset, size_t length, float* out_ptr) {
    memcpy(out_ptr, g_slice + offset, length * sizeof(float));
    return EIDSP_OK;
}

static uint32_t above_since   = 0; // ms the score first crossed ON
static uint32_t below_since   = 0; // ms the score first dropped below OFF (while active)
static time_t   event_epoch   = 0;
static uint32_t event_start_ms = 0;
static float    event_peak_db = 0.0f;
static float    event_peak_score = 0.0f;

// --- fast LED signal (two-stage LED, decoupled from event counting) ---
// Written only on the audio task; read as volatile from the main loop (core 1),
// same pattern as g_active. ON after the score holds above the ON threshold for
// LED_CONFIRM_MS; OFF within one slice of the score dropping below OFF.
static volatile bool g_led_hot       = false;
static uint32_t      led_above_since = 0;

// --- delayed clip start ---
// The clip opens CLIP_START_DELAY_MS after the event does, shifting the 5 s
// capture window toward the loudest part of the pass-by. At 0 it opens as soon
// as the event is confirmed.
static bool     g_clip_pending  = false;
static uint32_t g_clip_start_at = 0;

// Feed 16-bit PCM into the rolling slice buffer; run the model whenever a full
// 250 ms slice is ready and return the latest "siren" probability (held between
// inferences). The model expects raw int16 values cast to float (no scaling),
// which is exactly what EI's int16_to_float does on the training data.
static float classify(const int16_t* samples, size_t n) {
    if (!g_ei_ready || !samples) return g_last_score;
    if (g_paused || g_user_paused) return 0.0f; // cloud upload, or user paused detection

    for (size_t i = 0; i < n; i++) {
        g_slice[g_slice_fill++] = (float)samples[i];
        if (g_slice_fill >= EI_CLASSIFIER_SLICE_SIZE) {
            g_slice_fill = 0;

            signal_t signal;
            signal.total_length = EI_CLASSIFIER_SLICE_SIZE;
            signal.get_data     = &slice_get_data;

            ei_impulse_result_t result = { 0 };
            EI_IMPULSE_ERROR err = run_classifier_continuous(&signal, &result, false);
            if (err == EI_IMPULSE_OK) {
                g_ei_errors     = 0;
                g_recover_tries = 0; // healthy again — reset the escalation counter
                for (uint32_t i = 0; i < EI_CLASSIFIER_LABEL_COUNT; i++)
                    g_scores[i] = result.classification[i].value;
                g_last_score = g_scores[g_siren_index];
            } else {
                g_ei_errors++;
                uint32_t now = millis();
                // The DSP fails with EIDSP_OUT_OF_MEM even when total free heap is
                // healthy (~70 KB) because WiFi/TCP buffers from the upload leave
                // it FRAGMENTED — no single contiguous block big enough remains.
                // run_classifier_init() can't defragment, so if a few reinit
                // attempts don't restore inference, only a reboot truly clears it
                // (events + clips are already persisted to LittleFS).
                if (g_ei_errors >= DETECTOR_RECOVER_ERRORS &&
                    now - g_last_recover_ms >= DETECTOR_RECOVER_INTERVAL_MS) {
                    g_last_recover_ms = now;
                    g_ei_errors = 0;
                    if (++g_recover_tries > DETECTOR_MAX_RECOVERIES) {
                        Serial.printf("DSP unrecoverable (heap=%u, largest=%u) — rebooting\n",
                                      (unsigned)ESP.getFreeHeap(),
                                      (unsigned)ESP.getMaxAllocHeap());
                        Serial.flush();
                        ESP.restart();
                    }
                    g_slice_fill = 0;
                    run_classifier_init();
                    g_last_score = 0.0f;
                    Serial.printf("DSP recovery attempt %u (heap=%u, largest=%u)\n",
                                  (unsigned)g_recover_tries,
                                  (unsigned)ESP.getFreeHeap(),
                                  (unsigned)ESP.getMaxAllocHeap());
                } else if (g_ei_errors <= 3) {
                    // Only log the first few to avoid flooding serial
                    Serial.printf("EI classify error: %d (heap=%u, largest=%u)\n", err,
                                  (unsigned)ESP.getFreeHeap(),
                                  (unsigned)ESP.getMaxAllocHeap());
                }
            }
        }
    }
    return g_last_score;
}

void detector_init() {
    g_score = 0.0f;
    g_active = false;

    // Resolve which classification outputs are the "siren" / "cat" classes
    // (don't assume label order; cat is optional and only drives the live badge).
    g_siren_index = 0;
    g_cat_index   = -1;
    for (uint32_t i = 0; i < EI_CLASSIFIER_LABEL_COUNT; i++) {
        if (strcmp(ei_classifier_inferencing_categories[i], "siren") == 0) g_siren_index = (int)i;
        else if (strcmp(ei_classifier_inferencing_categories[i], "cat") == 0) g_cat_index = (int)i;
    }

    run_classifier_init();
    g_ei_ready = true;
    Serial.printf("Edge Impulse ready: %d labels, siren=index %d, slice=%d samples\n",
                  EI_CLASSIFIER_LABEL_COUNT, g_siren_index, EI_CLASSIFIER_SLICE_SIZE);
}

void detector_update(float db, const int16_t* samples, size_t n) {
    float score = classify(samples, n);
    g_score = score;
    uint32_t now = millis();

    // Fast LED signal, independent of the event state machine: candidate after
    // LED_CONFIRM_MS above ON, off within one slice below OFF, state held in
    // the hysteresis band between the two thresholds.
    if (score >= g_settings.score_on) {
        if (led_above_since == 0) led_above_since = now;
        if (now - led_above_since >= LED_CONFIRM_MS) g_led_hot = true;
    } else if (score < g_settings.score_off) {
        g_led_hot       = false;
        led_above_since = 0;
    } else {
        led_above_since = 0;
    }

    if (!g_active) {
        if (score >= g_settings.score_on) {
            if (above_since == 0) above_since = now;
            if (now - above_since >= g_settings.min_ms) {
                g_active        = true;
                event_epoch     = time(nullptr);
                event_start_ms  = above_since;
                event_peak_db   = db;
                event_peak_score = score;
                below_since     = 0;
                // Clip capture starts CLIP_START_DELAY_MS from now (see below);
                // it's uploaded after the event ends.
                g_clip_pending  = true;
                g_clip_start_at = now + CLIP_START_DELAY_MS;
            }
        } else {
            above_since = 0;
        }
        return;
    }

    // Event in progress: capture audio, track peaks, decide when it ends.
    if (g_clip_pending) {
        if ((int32_t)(now - g_clip_start_at) >= 0) {
            g_clip_pending = false;
            clips_begin(event_epoch);
        }
    } else {
        clips_write(samples, n);
    }
    if (db > event_peak_db)        event_peak_db = db;
    if (score > event_peak_score)  event_peak_score = score;

    if (score < g_settings.score_off) {
        if (below_since == 0) below_since = now;
        if (now - below_since >= DETECT_HANG_MS) {
            SirenEvent e;
            e.epoch      = event_epoch;
            e.duration_s = (uint16_t)((now - event_start_ms) / 1000UL);
            e.peak_db    = event_peak_db;
            e.confidence = event_peak_score;
            if (g_clip_pending) {
                // Event ended within the clip-start delay: no clip was ever
                // opened, and clips_current_name() still holds the PREVIOUS
                // clip — don't reference (or re-upload) that one.
                g_clip_pending = false;
                e.clip[0] = '\0';
            } else {
                clips_end(); // finalize the on-device clip
                strncpy(e.clip, clips_current_name(), sizeof(e.clip));
                e.clip[sizeof(e.clip) - 1] = '\0';
            }
            events_add(e);
            // Hand the finished clip to the cloud task: it uploads the WAV + event
            // after the detection (not during), then frees the local copy.
            if (e.clip[0] != '\0')
                cloud_upload_clip(e.epoch, e.duration_s, e.peak_db, e.confidence);

            leds_blink_onboard(); // one onboard-LED pulse marks the end of a detection

            g_active    = false;
            above_since = 0;
            below_since = 0;
        }
    } else {
        below_since = 0;
    }
}

float detector_score()  { return g_score; }
bool  detector_active() { return g_active; }

// Fast LED signal (two-stage LED): true while the live score is siren-like.
// main.cpp combines it with detector_active() — bright flash only when the
// event is confirmed (will be logged), dim candidate pulse before that.
bool detector_led_active() { return g_led_hot; }

// Live "cat" probability + a simple thresholded flag for the UI badge. Cat is a
// display-only indicator: it reuses the siren ON threshold but deliberately does
// NOT run the event state machine, so cats are never logged or counted.
float detector_cat_score() {
    return (g_cat_index >= 0) ? g_scores[g_cat_index] : 0.0f;
}
bool detector_cat_active() {
    return g_cat_index >= 0 && !g_active && g_scores[g_cat_index] >= g_settings.score_on;
}

// Per-class live probabilities (cat / siren / traffic, …) for real-time display.
int         detector_label_count()       { return EI_CLASSIFIER_LABEL_COUNT; }
const char* detector_label(int i)        { return ei_classifier_inferencing_categories[i]; }
float       detector_class_score(int i)  { return (i >= 0 && i < EI_CLASSIFIER_LABEL_COUNT) ? g_scores[i] : 0.0f; }

void detector_pause(bool paused) {
    g_paused = paused;
    if (paused) {
        g_slice_fill = 0; // discard partial slice data
        g_last_score = 0.0f;
    }
}

// User toggle from the web UI. Only flips a flag — classify() (audio task) reads
// it and returns 0 while paused, so any open event ends cleanly via the normal
// hang timeout. Deliberately doesn't touch g_slice_fill to avoid racing the audio
// task; the rolling window self-corrects within a slice on resume.
void detector_set_enabled(bool enabled) {
    g_user_paused = !enabled;
    if (!enabled) g_score = 0.0f; // live score reads 0 immediately while paused
}
bool detector_enabled() { return !g_user_paused; }

void detector_reinit() {
    g_slice_fill = 0;
    g_ei_errors  = 0;
    g_last_score = 0.0f;
    run_classifier_init();
    Serial.printf("DSP reinit (heap=%u)\n", (unsigned)ESP.getFreeHeap());
}

void detector_inject_test_event() {
    SirenEvent e;
    e.epoch      = time(nullptr);
    e.duration_s = (uint16_t)random(4, 21);
    e.peak_db    = 80.0f + random(0, 200) / 10.0f;
    e.confidence = 0.90f + random(0, 90) / 1000.0f;
    e.clip[0]    = '\0'; // local copy carries no on-device clip
    events_add(e);
    // Also exercise the VPS ingest path: stream a synthetic clip + push the event.
    cloud_test_clip(e.epoch, e.duration_s, e.peak_db, e.confidence);
}
