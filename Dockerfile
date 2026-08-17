# ============================
# Stage 1: Client Builder
# ============================
FROM oven/bun:1.3.8-alpine AS builder
WORKDIR /app

# Cache dependencies first (speeds up rebuilds)
COPY frontend/package.json ./frontend/
RUN cd frontend && bun install

# Copy source and build
COPY frontend ./frontend
RUN cd frontend && bun run build

# ============================
# Stage 2: Production
# ============================
FROM oven/bun:1.3.8-alpine
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
COPY backend/package.json ./backend/
RUN cd backend && bun install --production

# Copy backend source code
COPY backend ./backend

# Copy main package.json, pm2 config and .env (if present)
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

# If you use PM2 ecosystem
CMD ["bun", "start"]
