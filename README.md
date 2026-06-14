# 🚨 [sirenes.live](https://sirenes.live)

A small, always-on **ESP32** device that listens near a window, detects emergency-vehicle
sirens (Dutch two-tone _Martinshorn_ + electronic yelp/wail) with an on-device **Edge Impulse**
TinyML model, counts them, and logs **loudness (dB SPL)** and **time of day**.

The device hosts its own web page at `http://siren-detector.local` (live status + local history) in my local network.
Counts and the event log live **on the device** (flash / LittleFS); detection **audio + a durable
event database** are streamed to a small **self-hosted VPS archive** (in [`cloud/`](cloud/)) that
powers [sirenes.live](https://sirenes.live). No third-party cloud, no MQTT, no SD card.

## Features

- 🚨 On-device siren detection (Edge Impulse audio classifier).
- 🔊 Calibratable decibel (dB SPL) logging via a digital I2S MEMS mic.
- 📈 Dashboard graphs: sirens per day, time-of-day, weekday × hour heat-map, a GitHub-style
  year calendar, cumulative count, siren-time per day, and a sirens-vs-temperature correlation.
- 🌡️ Daily temperature for Amsterdam (via free [Open-Meteo](https://open-meteo.com/)) correlated
  against the siren count.
- ☁️ Self-hosted VPS archive: every detection's full-length audio + event history, with playback.
- 💡 WS2812 status LED (listening / detecting / error).
- 🔌 ~0.7–1.0 W, ≈ €2–3/year of electricity. Safe to run 24/7 (low-voltage USB, no LiPo).

## Hardware

- ESP32-WROOM-32 DevKit V1
- Adafruit ICS-43434 I2S MEMS microphone
- WS2812 RGB LED
- 5 V USB wall charger

Wiring, calibration, power, and safety details are in [SPECIFICATIONS.md](SPECIFICATIONS.md).

## Tech Stack

- **Firmware:** PlatformIO, Arduino framework, ESPAsyncWebServer, FastLED, ArduinoJson, LittleFS.
- **ML:** Edge Impulse (MFE audio block + small neural net), deployed as a C++ library.
- **Web UI:** Vite + React 18 + TypeScript + Chakra UI v3.
- **Cloud archive:** Node + Express + SQLite (single service) + Open-Meteo for daily weather,
  deployed to a k3s VPS via `git push` and served at [sirenes.live](https://sirenes.live).

## Getting Started

```bash
# Build firmware
cd firmware
~/.platformio/penv/bin/pio run

# Build + upload firmware, then the web UI filesystem
~/.platformio/penv/bin/pio run -e esp32dev -t upload --upload-port /dev/cu.usbserial-0001
~/.platformio/penv/bin/pio run -e esp32dev -t uploadfs --upload-port /dev/cu.usbserial-0001

# Develop the web UI with mock data (no device needed)
cd ../ui
npm install
npm run dev
```

Copy `firmware/include/wifi_credentials.h.example` to `wifi_credentials.h` and set your WiFi
SSID/password before building.

## License

MIT
