#include "audio.h"
#include "config.h"
#include "pins.h"
#include "settings.h"
#include "detector.h"
#include "record.h"
#include "clips.h"
#include "driver/i2s.h"
#include <math.h>

// ---------------------------------------------------------------------------
// M1: real I2S capture from the Adafruit ICS-43434 (legacy driver/i2s.h API,
// Arduino-ESP32 core 2.0.x). The mic outputs 24-bit data left-justified in a
// 32-bit frame on the LEFT channel (SEL -> GND). We compute dB SPL from the RMS
// and hand 16-bit PCM to the detector for the Edge Impulse model (M3).
// ---------------------------------------------------------------------------

static volatile float g_db = DB_FLOOR;

static TaskHandle_t g_audio_task = nullptr; // for stack-watermark diagnostics

// 0 dBFS RMS reference at the 32-bit full scale; +(94 - sensitivity) maps to SPL.
static constexpr float FULL_SCALE   = 2147483648.0f; // 2^31
static constexpr float SPL_REF_GAIN = 94.0f - MIC_SENSITIVITY_DBFS; // = 120 dB

void audio_init() {
    i2s_config_t cfg = {};
    cfg.mode                 = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX);
    cfg.sample_rate          = SAMPLE_RATE_HZ;
    cfg.bits_per_sample      = I2S_BITS_PER_SAMPLE_32BIT;
    cfg.channel_format       = I2S_CHANNEL_FMT_ONLY_RIGHT; // ESP32 quirk: mic (SEL->GND) lands here
    cfg.communication_format = I2S_COMM_FORMAT_STAND_I2S;
    cfg.intr_alloc_flags     = ESP_INTR_FLAG_LEVEL1;
    cfg.dma_buf_count        = 8;
    cfg.dma_buf_len          = 256;
    cfg.use_apll             = false;
    cfg.tx_desc_auto_clear   = false;
    cfg.fixed_mclk           = 0;

    i2s_pin_config_t pins = {};
    pins.bck_io_num   = PIN_I2S_BCLK;
    pins.ws_io_num    = PIN_I2S_WS;
    pins.data_out_num = I2S_PIN_NO_CHANGE;
    pins.data_in_num  = PIN_I2S_DATA;

    esp_err_t e1 = i2s_driver_install(I2S_NUM_0, &cfg, 0, nullptr);
    esp_err_t e2 = i2s_set_pin(I2S_NUM_0, &pins);
    if (e1 != ESP_OK || e2 != ESP_OK)
        Serial.printf("ERROR: I2S init failed (install=%d set_pin=%d)\n", e1, e2);
    else
        Serial.printf("I2S mic ready: BCLK=%u WS=%u DATA=%u @ %u Hz\n",
                      PIN_I2S_BCLK, PIN_I2S_WS, PIN_I2S_DATA, (unsigned)SAMPLE_RATE_HZ);
    g_db = DB_FLOOR;
}

static void audio_task(void*) {
    static int32_t raw[AUDIO_FRAME];
    static int16_t pcm[AUDIO_FRAME];
    float    smoothed   = DB_FLOOR;
    uint32_t last_print = 0;

    for (;;) {
        size_t bytes_read = 0;
        esp_err_t err = i2s_read(I2S_NUM_0, raw, sizeof(raw), &bytes_read, portMAX_DELAY);
        if (err != ESP_OK || bytes_read == 0) continue;
        size_t n = bytes_read / sizeof(int32_t);

        // Remove DC offset, then compute RMS.
        double sum = 0;
        for (size_t i = 0; i < n; i++) sum += raw[i];
        double mean = sum / (double)n;

        double sumsq = 0;
        for (size_t i = 0; i < n; i++) {
            double d = (double)raw[i] - mean;
            sumsq += d * d;
            // 24-bit sample → 16-bit PCM with digital gain (clamped) for recordings + classifier.
            int32_t s = raw[i] >> AUDIO_PCM_SHIFT;
            pcm[i] = s > 32767 ? 32767 : (s < -32768 ? -32768 : (int16_t)s);
        }
        double rms = sqrt(sumsq / (double)n) / FULL_SCALE;

        float db = (rms <= 1e-9) ? DB_FLOOR
                                 : 20.0f * log10f((float)rms) + SPL_REF_GAIN + g_settings.cal_offset_db;
        if (db < DB_FLOOR) db = DB_FLOOR;

        smoothed += 0.2f * (db - smoothed);
        g_db = smoothed;

        detector_update(smoothed, pcm, n);
        record_feed(pcm, n);   // M2: append to the WAV when a recording is active
        clips_service();       // run any clip deletes queued by the cloud upload task

        if (SERIAL_AUDIO_MONITOR) { // ~2 Hz serial readout for calibration + M3 bring-up
            uint32_t now = millis();
            if (now - last_print >= 500) {
                last_print = now;
                Serial.printf("dB SPL: %.1f  |", smoothed);
                for (int i = 0; i < detector_label_count(); i++)
                    Serial.printf("  %s:%.2f", detector_label(i), detector_class_score(i));
                if (detector_active()) Serial.print("   [DETECTING]");
                Serial.println();
            }
        }
    }
}

void audio_start_task() {
    // 12 KB stack. The EI DSP/inference allocates from the heap (now the
    // dedicated EI pool), not the stack: measured high-water was ~2.3 KB used
    // of the old 32 KB (audioStk in the cloud task's diagnostic line), so 12 KB
    // keeps a ~5x margin and returns 20 KB to the system heap for WiFi/web.
    xTaskCreatePinnedToCore(audio_task, "audio", 12288, nullptr, 2, &g_audio_task, 0);
}

float audio_get_db() {
    return g_db;
}

uint32_t audio_task_stack_min() {
    // uxTaskGetStackHighWaterMark returns the minimum free stack in words.
    return g_audio_task ? uxTaskGetStackHighWaterMark(g_audio_task) * sizeof(StackType_t) : 0;
}
