# Siren Detector cloud app — builds the React archive site and runs the Node
# server that ingests streamed audio/events and serves the site + API.
# Deployed to the k3s VPS via `git push deploy main` (see helm-values.yaml).

# --- stage 1: build the web UI ---------------------------------------------
FROM node:22-bookworm-slim AS web
WORKDIR /app/cloud/web
COPY cloud/web/package.json cloud/web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY cloud/web/ ./
RUN npm run build

# --- stage 2: server runtime -----------------------------------------------
FROM node:22-bookworm-slim
ENV NODE_ENV=production
# Day/hour bucketing uses localtime; match the device's timezone.
ENV TZ=Europe/Amsterdam
WORKDIR /app/cloud/server
COPY cloud/server/package.json cloud/server/package-lock.json ./
# better-sqlite3 ships prebuilt binaries for node:22 (no native toolchain needed).
RUN npm ci --omit=dev --no-audit --no-fund
COPY cloud/server/ ./
# Built static site from stage 1, where the server expects it (../web/dist).
COPY --from=web /app/cloud/web/dist /app/cloud/web/dist

ENV DATA_DIR=/data
EXPOSE 8080
CMD ["node", "src/index.js"]
