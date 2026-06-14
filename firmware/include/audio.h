#pragma once
#include <Arduino.h>

// Initializes the audio front-end: configures the I2S driver for the ICS-43434.
void audio_init();

// Starts the continuous audio task pinned to core 0 (read -> dB -> detector).
void audio_start_task();

// Latest smoothed sound level in dB SPL (thread-safe read).
float audio_get_db();

// Smallest free stack (bytes) the audio task has ever had — for right-sizing the
// 32 KB stack. 0 until the task has run. Cheap; reads the FreeRTOS watermark.
uint32_t audio_task_stack_min();
