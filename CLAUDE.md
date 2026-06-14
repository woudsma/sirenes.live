# CLAUDE.md — Project Conventions

## Project Overview

Siren Detector: an always-on **ESP32** device that listens near a window, detects emergency
sirens (Dutch two-tone + electronic yelp/wail) with an on-device **Edge Impulse** TinyML model,
counts them, and logs **loudness (dB SPL)** and **time**. It serves a **React + Chakra v3** web
page at `http://siren-detector.local` with occurrence / loudness / time-of-day graphs. Counts +
the event log live **on-device in LittleFS**; detection **audio is streamed to a self-hosted VPS
archive** (`cloud/`, see `SPECIFICATIONS.md` §7) that also keeps a durable event database and a
public event-log / graphs / playback site. No MQTT, no SD card.

**`SPECIFICATIONS.md` is the source of truth** for hardware and software. Update it first.
**`JOURNAL.md`** holds short dated progress notes (useful while waiting on components).

## Directory Structure

```
siren-detector/
├── firmware/          PlatformIO ESP32 project
│   ├── include/       headers (pins.h, config.h, *.h, wifi_credentials.h [gitignored])
│   ├── src/           main.cpp, audio.cpp, detector.cpp, cloud.cpp, events.cpp, webserver.cpp, wifi_setup.cpp, leds.cpp
│   ├── lib/           Edge Impulse exported library (added in M3)
│   ├── data/          built web UI (generated — do not edit by hand)
│   ├── scripts/       build_ui.py (auto-builds UI before filesystem upload)
│   └── platformio.ini
├── ui/                Vite + React 18 + TS + Chakra v3 web interface (on-device UI)
│   └── src/           main.tsx, App.tsx, hooks/, components/, charts/, mock/
├── cloud/             VPS archive (deployed via `git push deploy main`)
│   ├── server/        Node + Express + SQLite: ingest + API + serves the site
│   └── web/           Vite + React 18 + TS + Chakra v3 event-log/graphs/playback site
├── Dockerfile  helm-values.yaml            (deploy artifacts for cloud/)
├── CLAUDE.md  SPECIFICATIONS.md  JOURNAL.md  README.md
```

## Important Rules

- Edit `firmware/data/` **never** by hand — it is generated from `ui/` by `npm run build`.
- Secrets (WiFi credentials **+ the cloud host/port/device token**) live in
  `firmware/include/wifi_credentials.h`, which is **gitignored**. Copy `wifi_credentials.h.example`
  to create it. Leave `CLOUD_HOST ""` to disable VPS uploads.
- The `cloud/` app deploys to the VPS with `git push deploy main` (remote `deploy@k3s:siren-detector`).
  Set the real ingress host in `helm-values.yaml` and create the `siren-detector-secrets` k8s secret
  (`DEVICE_TOKEN` must match the firmware's). Never edit `cloud/web/dist/` by hand (built).
- Keep `SPECIFICATIONS.md` current when pins, thresholds, or dependencies change.
- Safety first: this runs 24/7 — see the Safety section in `SPECIFICATIONS.md`.

## Commands

All firmware commands run from `firmware/`. Serial port: `/dev/cu.usbserial-0001`.

| Task | Command |
|---|---|
| Build firmware (no upload) | `~/.platformio/penv/bin/pio run` |
| Upload firmware | `~/.platformio/penv/bin/pio run -e esp32dev -t upload --upload-port /dev/cu.usbserial-0001` |
| Upload filesystem (web UI) | `~/.platformio/penv/bin/pio run -e esp32dev -t uploadfs --upload-port /dev/cu.usbserial-0001` |
| Upload both firmware + filesystem | Chain the two upload commands with `&&` |
| Serial monitor | `~/.platformio/penv/bin/pio device monitor --port /dev/cu.usbserial-0001 --baud 115200` |
| Web UI dev server | `npm run dev` (from `ui/`) |
| Check web UI for errors | `npm run build` (from `ui/`) |

> The filesystem upload auto-builds the web UI via `scripts/build_ui.py` — no need to run
> `npm run build` separately before uploading.

**Cloud app (`cloud/`):**

| Task | Command |
|---|---|
| Build the site | `npm install && npm run build` (from `cloud/web/`) |
| Run server + site together | `./dev.sh` (from `cloud/` — seeds demo data, starts the API on `:8080` and frontend on `:3000`; Ctrl-C stops both) |
| Seed local DB from CSV | `DATA_DIR=./data npm run seed` (from `cloud/server/`; imports `seed/events.csv`, skips if non-empty, `-- --force` to re-import) |
| Run server locally | `DATA_DIR=./data DEVICE_TOKEN=dev ADMIN_TOKEN=admin npm start` (from `cloud/server/`) |
| Dev (site + API proxy) | `npm run dev` (from `cloud/web/`, port `3000`, proxies `/api` → `localhost:8080`) |
| Deploy to VPS | `git push deploy main` (root `Dockerfile` + `helm-values.yaml`) |

## Key Source Files

### Firmware (`firmware/src/`)
| File | Purpose |
|---|---|
| `main.cpp` | setup/loop, FreeRTOS audio task on core 0, 5 Hz WS status broadcast |
| `audio.cpp` | I2S (ICS-43434) read + RMS → dB SPL (calibrated) |
| `detector.cpp` | Edge Impulse inference (continuous) + siren event state machine |
| `cloud.cpp` | streams detection audio (8 kHz/8-bit) + posts events to the VPS archive (core-1 task) |
| `events.cpp` | LittleFS CSV event log + per-day/hour/dB aggregation + JSON |
| `webserver.cpp` | AsyncWebServer: serve UI, REST + WebSocket, config, CSV export, sim-event |
| `wifi_setup.cpp` | STA + AP fallback, mDNS, NTP (TZ Europe/Amsterdam) |
| `leds.cpp` | FastLED WS2812 status patterns |

### Web UI (`ui/src/`)
| File | Purpose |
|---|---|
| `main.tsx` | ChakraProvider + system setup |
| `App.tsx` | layout shell + tabs (Dashboard / Events / Settings) |
| `hooks/useDevice.ts` | WS live status + REST fetch of stats/events; falls back to mock data offline |
| `mock/` | bundled mock dataset for offline UI design |
| `components/`, `charts/` | status cards, dB meter, charts (per-day, time-of-day, loudness) |

## Hardware Quick Reference

| Signal | GPIO (board label) |
|---|---|
| I2S BCLK / WS / DATA | 16 / 17 / 18 (RX2 / TX2 / D18) |
| WS2812 DIN | 4 (D4) |
| Onboard LED | 2 (D2) |

All on the breadboard's bottom (3V3/GND) row.

Full pinout, calibration, power, and safety details: `SPECIFICATIONS.md`.

## Milestones

- **M0** Scaffold ✅: docs, firmware skeleton (WiFi/web/LED/event-log), UI with mock data + charts.
- **M1** Mic bring-up ✅: real I2S, serial dB, LED test, dB calibration.
- **M2** Data collection ✅: record labeled WAV clips through the real mic.
- **M3** Model integration (**current**): Edge Impulse model exported to `lib/`, real detection +
  logging live; detection audio + events streamed to the VPS archive (`cloud/`).
- **M4** Polish: tune thresholds, finalize charts, optional case, safety re-check.
