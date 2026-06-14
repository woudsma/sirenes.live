#pragma once
#include <Arduino.h>

void webserver_init();

// Broadcast a JSON status frame to all WebSocket clients.
void webserver_broadcast_status(const char* json);

// Pause/resume the WS status broadcast around a heap-heavy network transfer (the
// cloud clip upload), so its message-buffer allocations don't compete for heap.
// Mirrors the pause used during a record download. Safe to call from another task.
void webserver_pause_ws(bool paused);

// Pending UI command flags (consume-once), polled from the main loop.
bool webserver_cmd_sim_event();

// Number of connected WebSocket clients (heap diagnostics: each client holds a
// message queue that can pin heap while it's backed up).
size_t webserver_ws_count();
