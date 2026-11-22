# ez standard Dockerfile: a build stage for the frontend bundle, then an Alpine
# runtime that runs as the unprivileged `bun` user (uid 1000) with a wget
# healthcheck. Keep the Bun version in step with `bun-version` in .github/workflows.

# ---- build: frontend bundle ----
FROM oven/bun:1.4.5-alpine AS build
WORKDIR /app
COPY frontend/package.json frontend/bun.lock ./frontend/
RUN cd frontend && bun install --frozen-lockfile
COPY package.json ./
COPY frontend ./frontend
RUN cd frontend && bun run build

# ---- runtime ----
FROM oven/bun:1.4.5-alpine
ARG APP_VERSION=dev
LABEL org.opencontainers.image.title="eziarr" \
	org.opencontainers.image.source="https://github.com/c4lyp5o/eziarr" \
	org.opencontainers.image.licenses="MIT" \
	org.opencontainers.image.version="$APP_VERSION"
RUN apk add --no-cache tzdata
ENV TZ=Asia/Kuala_Lumpur \
	NODE_ENV=production \
	HOST=0.0.0.0 \
	PORT=5000
WORKDIR /app
# pm2-runtime supervises the processes; installed as root into /opt/bun, run as bun.
ENV BUN_INSTALL=/opt/bun PATH="/opt/bun/bin:${PATH}"
RUN bun add -g pm2
COPY backend/package.json backend/bun.lock ./backend/
RUN cd backend && bun install --production --frozen-lockfile --ignore-scripts
COPY backend ./backend
COPY package.json ecosystem.config.js ./
COPY --from=build /app/client ./client
RUN mkdir -p /app/db /app/downloads /app/logs && chown -R bun:bun /app/db /app/downloads /app/logs
USER bun
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --start-interval=2s --retries=3 \
	CMD wget -qO- "http://127.0.0.1:${PORT}/api/v1" >/dev/null || exit 1
CMD ["bun", "start"]
