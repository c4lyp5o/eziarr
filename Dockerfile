# ============================
# Stage 1: Client Builder
# ============================
FROM oven/bun:1.4.3-alpine AS builder
WORKDIR /app

# Cache dependencies first (speeds up rebuilds)
# The lockfile pins exactly what CI tested.
COPY frontend/package.json frontend/bun.lock ./frontend/
RUN cd frontend && bun install --frozen-lockfile

# Copy source and build
COPY frontend ./frontend
RUN cd frontend && bun run build

# ============================
# Stage 2: Production
# ============================
FROM oven/bun:1.4.3-alpine
WORKDIR /app

# Install system deps
RUN apk add --no-cache tzdata curl
ENV TZ=Asia/Kuala_Lumpur

# Non-root user that runs the service (this app downloads untrusted media)
RUN addgroup -S eziarr && adduser -S eziarr -G eziarr -h /home/eziarr
# Bun global bins for the app user (pm2 is installed below as eziarr,
# because /root/.bun is unreachable once we drop privileges)
ENV PATH="/home/eziarr/.bun/bin:${PATH}"

# Copy backend and install deps
# --ignore-scripts: Bun 1.4 runs bufferutil/utf-8-validate's native build
# by default; on Alpine it fails (no musl prebuilds, no compiler) and Bun
# then DELETES both packages, so the Telegram client can't load. Without the
# script they install as-is and fall back to their pure-JS code, as on Bun
# 1.3. No backend dependency needs an install script.
COPY backend/package.json backend/bun.lock ./backend/
RUN cd backend && bun install --production --frozen-lockfile --ignore-scripts

# Copy backend source code
COPY backend ./backend

# Copy main package.json and the pm2 config (.env is never copied: it's in
# .dockerignore; configure the container with environment variables)
COPY package.json ./
COPY ecosystem.config.js ./

# Copy built client bundle
COPY --from=builder /app/client ./client

# Writable runtime directories (db, downloads, logs) owned by the app user
RUN mkdir -p /app/db /app/downloads /app/logs \
	&& chown -R eziarr:eziarr /app

USER eziarr

# Install PM2 as the app user so it runs without root. The oven/bun image
# pins BUN_INSTALL_BIN=/usr/local/bin (root-owned), so redirect the global
# bin dir to a user-writable dir that is already on PATH above.
RUN BUN_INSTALL_BIN=/home/eziarr/.bun/bin bun add -g pm2

EXPOSE 5000

# /api/v1 is the public health route. Shell form so PORT can move it.
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
	CMD curl -fsS -m 5 "http://localhost:${PORT:-5000}/api/v1" || exit 1

# If you use PM2 ecosystem
CMD ["bun", "start"]
