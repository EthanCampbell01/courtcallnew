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

# Shared libs for headless Chrome (used by the optional draw scraper, ENABLE_SCRAPER=true).
# Puppeteer downloads its own Chrome build during npm install below rather than using
# Debian's `chromium` package, which reliably SIGTRAPs (crashpad hits a denied syscall)
# on Railway's containers.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates fonts-liberation wget \
      libasound2 libatk-bridge2.0-0 libatk1.0-0 libatspi2.0-0 libcups2 \
      libdbus-1-3 libdrm2 libgbm1 libgtk-3-0 libnspr4 libnss3 \
      libpangocairo-1.0-0 libxcomposite1 libxdamage1 libxfixes3 \
      libxkbcommon0 libxrandr2 libxshmfence1 xdg-utils \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
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
