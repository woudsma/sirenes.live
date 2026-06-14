#pragma once
#include <stdbool.h>

void wifi_init();
bool wifi_is_connected();
// True once NTP has set a valid wall-clock time (epoch > 2021).
bool wifi_time_valid();
