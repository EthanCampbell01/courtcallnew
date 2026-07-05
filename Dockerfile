# ---------- Stage 1: build the React client ----------
FROM node:20 AS client-build
WORKDIR /build/client
COPY client/package*.json ./
RUN npm ci || npm install
COPY client/ ./
RUN npm run build

# ---------- Stage 2: runtime ----------
FROM node:20-slim
WORKDIR /app

# Chromium for the optional draw scraper (ENABLE_SCRAPER=true)
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-liberation ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    DATA_DIR=/app/server/data

# Server deps (better-sqlite3 builds from source if no prebuilt binary matches)
COPY server/package*.json ./server/
RUN cd server && (npm ci --omit=dev || npm install --omit=dev)

COPY server/ ./server/
COPY --from=client-build /build/client/dist ./client/dist

# SQLite lives here — attach a Railway Volume at /app/server/data to persist it
RUN mkdir -p /app/server/data

EXPOSE 3001
CMD ["node", "server/index.js"]
