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

# Install PM2 globally using Bun
RUN bun add -g pm2

# Non-root user that runs the service (this app downloads untrusted media)
RUN addgroup -S eziarr && adduser -S eziarr -G eziarr -h /home/eziarr

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

EXPOSE 5000

# If you use PM2 ecosystem
CMD ["bun", "start"]
