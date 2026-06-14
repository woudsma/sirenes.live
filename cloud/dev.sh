#!/usr/bin/env bash
# Start the cloud app locally: API server (port 8080) + frontend dev server
# (port 3000, proxies /api -> 8080). Ctrl-C stops both.
#
#   ./dev.sh
#
# Dev-only tokens; they just have to match between client and server here.
set -euo pipefail

cd "$(dirname "$0")"

# Install deps on first run so a fresh clone works out of the box.
[ -d server/node_modules ] || (echo ">>> installing server deps..." && cd server && npm install)
[ -d web/node_modules ]    || (echo ">>> installing web deps..."    && cd web    && npm install)

# Seed the local DB from the bundled CSV (no-op once it already has events).
echo ">>> seeding demo data..."
(cd server && DATA_DIR=./data npm run --silent seed)

# Start the API server in the background and make sure it dies with this script.
echo ">>> starting API server on http://localhost:8080 ..."
(cd server && DATA_DIR=./data DEVICE_TOKEN=dev ADMIN_TOKEN=admin ALLOW_DEV_SEED=1 npm start) &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT

# Run the frontend in the foreground (Ctrl-C here triggers the trap above).
echo ">>> starting frontend on http://localhost:3000 ..."
cd web && npm run dev
