#include "ei_pool.h"
#include "config.h"
#include <multi_heap.h>
#include "freertos/FreeRTOS.h"
#include "edge-impulse-sdk/porting/ei_classifier_porting.h"

// ---------------------------------------------------------------------------
// Dedicated Edge Impulse heap. The EI DSP allocates ~20-30 KB of MFCC/FFT
// scratch from ei_malloc on EVERY 250 ms slice. With the default (weak)
// implementations those allocations come from the system heap, where they race
// WiFi/AsyncTCP/WebSocket buffers — a web-UI load could starve the DSP
// (EIDSP_OUT_OF_MEM, -1002) until the recovery ladder rebooted the board.
//
// Here we provide STRONG overrides of the SDK's weak ei_malloc/ei_calloc/
// ei_free (edge-impulse-sdk/porting/arduino/ei_classifier_porting.cpp), backed
// by a static pool managed with ESP-IDF's multi_heap. Inference gets a
// guaranteed, fragmentation-isolated arena; the system heap keeps WiFi traffic.
//
// Linkage note: EI_C_LINKAGE is not defined, so these symbols are C++-mangled —
// the signatures must exactly match ei_classifier_porting.h (included above)
// and must NOT be wrapped in extern "C", or they would silently not override.
// Runtime proof of the override: the "EIpool" diagnostic in main.cpp must show
// the pool being consumed; pool free == EI_POOL_BYTES means it's NOT in use.
// ---------------------------------------------------------------------------

// The pool is carved out of the heap ONCE at boot (a static BSS array of this
// size overflows the ESP32's dram0 static-data segment). At ei_pool_init()
// time the heap is still ~180 KB free and unfragmented, so the one big
// contiguous grab is reliable; afterwards the region is permanently the EI
// arena and never returns to the system allocator.
static uint8_t*            s_pool      = nullptr;
static multi_heap_handle_t s_heap      = nullptr;
static portMUX_TYPE        s_mux       = portMUX_INITIALIZER_UNLOCKED;
static volatile uint32_t   s_fallbacks = 0;

// Called from setup() before detector_init() (whose run_classifier_init()
// makes the first persistent allocations), plus lazily as a belt-and-braces
// guard. The real first call happens single-threaded in setup().
static inline void pool_init_once() {
    if (s_heap) return;
    uint8_t* mem = (uint8_t*)malloc(EI_POOL_BYTES);
    if (!mem) return; // pathological: every ei_malloc falls back to the system heap
    multi_heap_handle_t h = multi_heap_register(mem, EI_POOL_BYTES);
    if (!h) { free(mem); return; }
    // multi_heap leaves the lock NULL; allocs come from the audio task (core 0)
    // and detector_reinit() on the cloud task (core 1), so it must be set.
    multi_heap_set_lock(h, &s_mux);
    s_pool = mem;
    s_heap = h;
}

void ei_pool_init() {
    pool_init_once();
    if (s_heap)
        Serial.printf("EI pool ready: %u bytes [system heap=%u]\n",
                      (unsigned)EI_POOL_BYTES, (unsigned)ESP.getFreeHeap());
    else
        Serial.println("EI pool ALLOC FAILED — EI falls back to the system heap");
}

// --- strong overrides of the EI SDK's weak allocator hooks ------------------

void* ei_malloc(size_t size) {
    if (size == 0) return nullptr;
    pool_init_once();
    void* p = s_heap ? multi_heap_malloc(s_heap, size) : nullptr;
    if (p) return p;
    // Pool exhausted: fall back to the system heap (best effort — better a
    // risky alloc than a guaranteed failed slice) and make it visible.
    s_fallbacks = s_fallbacks + 1;
    static uint32_t last_log = 0;
    uint32_t now = millis();
    if (now - last_log >= 5000) {
        last_log = now;
        Serial.printf("EI pool fallback: %u bytes (pool free=%u largest=%u) — EI_POOL_BYTES too small\n",
                      (unsigned)size, (unsigned)ei_pool_free(), (unsigned)ei_pool_largest());
    }
    return malloc(size);
}

void* ei_calloc(size_t nitems, size_t size) {
    size_t total = nitems * size;
    void*  p     = ei_malloc(total);
    if (p) memset(p, 0, total);
    return p;
}

void ei_free(void* ptr) {
    if (!ptr) return;
    // Route by pointer range: pool allocations back to the pool, fallback
    // allocations to the system heap.
    if (s_pool && (uint8_t*)ptr >= s_pool && (uint8_t*)ptr < s_pool + EI_POOL_BYTES)
        multi_heap_free(s_heap, ptr);
    else
        free(ptr);
}

// --- diagnostics -------------------------------------------------------------

size_t ei_pool_free() {
    if (!s_heap) return EI_POOL_BYTES;
    multi_heap_info_t info;
    multi_heap_get_info(s_heap, &info);
    return info.total_free_bytes;
}

size_t ei_pool_low_water() {
    if (!s_heap) return EI_POOL_BYTES;
    multi_heap_info_t info;
    multi_heap_get_info(s_heap, &info);
    return info.minimum_free_bytes;
}

size_t ei_pool_largest() {
    if (!s_heap) return EI_POOL_BYTES;
    multi_heap_info_t info;
    multi_heap_get_info(s_heap, &info);
    return info.largest_free_block;
}

uint32_t ei_pool_fallbacks() {
    return s_fallbacks;
}
