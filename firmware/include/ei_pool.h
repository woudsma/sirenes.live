#pragma once
#include <Arduino.h>

// Dedicated heap for the Edge Impulse DSP + inference (see ei_pool.cpp). The
// strong ei_malloc/ei_calloc/ei_free overrides route ALL Edge Impulse
// allocations into a static pool, so inference never competes with WiFi /
// AsyncTCP / WebSocket for the system heap (the cause of the EIDSP_OUT_OF_MEM
// -1002 → reboot failures).
void ei_pool_init();

// Diagnostics (all read from multi_heap_get_info; safe from any task).
size_t   ei_pool_free();      // current free bytes in the pool
size_t   ei_pool_low_water(); // minimum free bytes ever — sizing: peak use = EI_POOL_BYTES − this
size_t   ei_pool_largest();   // largest free block in the pool
uint32_t ei_pool_fallbacks(); // allocations that overflowed to the system heap (should stay 0)
