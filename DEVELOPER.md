# Eziarr Developer Documentation

How Eziarr is put together. For setting up a dev environment, the branch flow and what a PR needs, see [CONTRIBUTING.md](CONTRIBUTING.md); for the traps that have bitten this codebase before, see [AGENTS.md](AGENTS.md).

## 🏗️ Architecture

Eziarr is two Bun processes run by PM2 (`ecosystem.config.js`), sharing one SQLite database in WAL mode:

```
            browser (React SPA, served from client/)
                         │  HttpOnly session cookies
                         ▼
 ┌───────────────────────────────┐        ┌────────────────────────────────┐
 │ server  (backend/index.js)    │        │ worker  (backend/worker.js)    │
 │ Elysia REST API under /api/v1 │        │ sync · hunter · download queue │
 │ deep search, force grab,      │        │ · import · sweeper             │
 │ settings, auth                │        │                                │
 └──────────────┬────────────────┘        └───────────────┬────────────────┘
                │      db/eziarr.sqlite (WAL): settings,   │
                └──────► missing_items, download_queue, ◄──┘
                         active_tasks, download_history
                │                                          │
                ▼                                          ▼
      Radarr · Sonarr · Lidarr · Prowlarr        Telegram (MTProto) · HTTP
```

- The **server** answers the UI and never downloads anything. Queuing a download inserts a `download_queue` row.
- The **worker** syncs missing lists from the *Arrs, runs the hunter, processes the download queue one job at a time (download → `/app/downloads` → *Arr import scan → verify), and sweeps old files.
- They share state only through SQLite. `active_tasks` carries live progress from the worker to the UI.

### Stack

| | |
| --- | --- |
| Runtime | Bun 1.4 (the Docker image pins `oven/bun:1.4.3-alpine`; CI uses the same) |
| API | ElysiaJS, with TypeBox schemas for every body and response |
| Database | `bun:sqlite`, WAL mode |
| *Arr / HTTP | Axios, through `arr.js` |
| Telegram | GramJS (MTProto, your own account) |
| UI | React 19, Vite, Tailwind CSS v4, Motion, SWR, Lucide icons |
| Lint / format | Biome (frontend) |
| Tests | `bun test` |

## 📂 Backend (`backend/`)

| File | Role |
| --- | --- |
| `index.js` | Entry point: Elysia app, error handling, the two route guards (auth routes; protected routes), static UI, first-boot setup. |
| `worker.js` | Worker entry point: schedules sync, hunter, queue processing and the sweeper; runs a download job end to end. |
| `config.js` | Defaults and paths (`DOWNLOAD_DIR`, `DB_DIR`, `LOG_DIR`, overridable by env) and `MAX_DOWNLOAD_BYTES` (5 GiB). |
| `db.js` | Schema and every query. Nothing else talks SQL. |
| `arr.js` | `arr(config, service)`: the one way to call an *Arr. Applies the base URL, API version (v3 Radarr/Sonarr, v1 Lidarr/Prowlarr) and API key. |
| `sync.js` | Pages each *Arr's full missing list and applies it in one transaction; never cleans up from a partial list. |
| `import.js` | Import scan command, Radarr import verification, and `buildImportFilename()` (the name a download is saved under). |
| `session.js` | Session versions (`tokenVersion`) and access/refresh token verification. |
| `setup.js` | First boot: the one-time setup code, or `EZIARR_PASSWORD`. |
| `downloader.js`, `telegram.js` | HTTP and Telegram downloads into `DOWNLOAD_DIR`. |
| `opendir.js`, `ia.js` | Open-directory scanning and Internet Archive search. |
| `logger.js`, `logtail.js` | Rotating logs (one file per process) and the merged tail the Logs tab shows. |
| `utils.js` | SSRF guard (`isSafeUrl`, safe agents), client IP, path translation, queue fetching and caching, download naming, the sweeper. |
| `routes/`, `models/`, `services/` | Per area (auth, missing, settings, system, downloads, telegram, ia, opendir, httpimport): routes attach the TypeBox models and call the services. |
| `plugins/` | `auth.plugin.js` derives `isAdmin` from the session cookie; `protector.plugin.js` refuses requests without one. Both are `scoped`. |
| `tests/` | `bun test` suites; `setup.js` (preloaded via `bunfig.toml`) points data dirs at a temp directory. |

### Request lifecycle and auth

Protected routes sit in one Elysia `guard` that uses `AuthPlugin` then `ProtectorPlugin`:

1. `AuthPlugin` (`derive`, transform phase) verifies the `eziarr_access` cookie against the current session version and sets `isAdmin`.
2. `ProtectorPlugin` (`onTransform`, also before body validation) throws a 401 when `isAdmin` is not set.
3. Then validation, then the handler.

Both hooks must be `{ as: "scoped" }`. Elysia hooks are local to the plugin that declares them, so an unscoped hook silently stops protecting anything (that was a real, critical bug until 1.4). `tests/protected-routes.test.js` walks `app.routes` and requires a 401 from every protected route without a session; adding a public route means adding it to that test's `PUBLIC` list on purpose.

Sessions: a 15-minute access token and a refresh token (1 day, or 30 with "keep me signed in"), both carrying `tv`, the session version. A password change bumps the version, revoking every other session, and re-issues the caller's.

### Data flow of a download

1. The UI calls `POST /telegram/import` or `POST /http/import`. The service asks the *Arr for the proper name (`buildImportFilename`) and inserts a `download_queue` row.
2. The worker claims the job, downloads to `DOWNLOAD_DIR/<name>`, records `downloadedPath` on the job (so an import retry never downloads again), and asks the *Arr to scan that **file path** (not the folder: Radarr silently imports nothing from a folder scan of flat files).
3. For Radarr it then polls the movie until a *new* file id appears or the file leaves the drop folder; otherwise the job fails and retries with backoff (5 attempts).
4. The job moves to `download_history` as `completed` or `failed`.

## 🗄️ Database

`db/eziarr.sqlite`, WAL mode, `busy_timeout = 5000`. All access goes through `db.js`.

| Table | Purpose | Columns |
| --- | --- | --- |
| `missing_items` | Cache of the *Arrs' missing lists (written by sync) | `id` (`radarr-123`), `service_id`, `title`, `series_title`, `type` (movie/episode/album), `service`, `release_date`, `poster_url`, `status`, `last_searched_at` (hunter) |
| `download_queue` | Worker job queue | `id`, `type` (telegram/http), `payload` (JSON, incl. `downloadedPath` once downloaded), `status` (pending/downloading/retry), `attempts`, `last_error`, `next_attempt`, `created_at`, `updated_at`, `started_at` |
| `active_tasks` | Live progress, worker → UI | `id`, `type`, `status`, `message`, `progress` (0–100), `updated_at` |
| `download_history` | Audit trail, kept forever | `id`, `type`, `service`, `service_id`, `filename`, `source_url`, `channel`, `message_id`, `status` (completed/failed), `attempts`, `last_error`, `result_file_path`, `duration_ms`, `download_bytes`, timestamps |
| `settings` | Key/value, JSON-encoded values | User settings (the keys in `DEFAULT_SETTINGS`, the only ones the API can write) plus internal state: `password` (Argon2 hash), `jwtSecret`, `isFirstTime`, `tokenVersion`, `telegramSession`, `telegramTempHash`, `telegramTempPhoneNumber` |

## 🔌 API

Everything is under `/api/v1`. Public: `GET /` (health), `GET`/`POST /firsttime`, `POST /login`, `GET /me`, `POST /refresh`, `POST /logout`. Everything else needs a session.

| Area | Routes |
| --- | --- |
| Missing | `GET /missing` (missing items + all queues + `unavailable` services) · `POST /missing/search` · `POST /missing/deepsearch` (Prowlarr) · `POST /missing/forcegrab` · `POST /missing/unmonitor` |
| Downloads | `POST /telegram/import` · `POST /http/import` · `GET /downloads/queue` · `GET /downloads/history` · `GET /downloads/stats` |
| Sources | `GET /telegram/status` · `POST /telegram/auth/send-code` · `POST /telegram/auth/login` · `POST /telegram/search` · `POST /ia/search` · `GET /ia/files/:identifier` · `POST /opendir/scan` |
| Settings & system | `GET`/`POST /settings` · `POST /settings/batch` · `GET /system/status` · `POST /system/test` · `GET /system/tasks` · `GET /system/logs?type=general\|hunter` |

Response schemas are enforced: Elysia **drops fields a response model doesn't declare**, so a new field needs adding to its model in `models/` or it never reaches the UI. With `NODE_ENV=development`, the OpenAPI UI is served at `/openapi`.

## 🎨 Frontend (`frontend/src/`)

| Path | Role |
| --- | --- |
| `App.jsx` | Shell (top bar, theme toggle), title row, count-card filters, poster wall; lazy-loads the two sheets. |
| `components/MediaCard.jsx` | A poster tile: download rail and state, search / deep search / unmonitor. |
| `components/ResultsModal.jsx` + `*Tab.jsx` | Deep search: Indexers, Telegram, Internet Archive, Open directory. |
| `components/SettingsModal.jsx` + `settings/*Tab.jsx` | Settings sheet shell (state and data) and one presentational file per tab. |
| `components/Modal.jsx`, `Tabs.jsx`, `Buttons.jsx`, `Mark.jsx` | Shared primitives: portalled animated dialog, underline tabs, buttons, the logo. |
| `context/Theme.jsx`, `context/Toast.jsx` | Light/dark theme (follows the OS until chosen) and toasts. |
| `ui/styles.js`, `ui/motion.js` | Class recipes and the shared motion presets. |
| `utils/apiCall.js` | `fetch` wrapper; on a 401 it refreshes the session once and retries. |
| `index.css` | Design tokens for both themes (`--ground`, `--surface`, `--ink`, `--accent`, …) exposed to Tailwind as `bg-surface`, `text-ink`, etc. |

**Design rules:** use the tokens, never raw Tailwind palette colours, so both themes work. Surfaces separate by lightness, not borders or shadows (only floating things like dialogs and toasts get a shadow). The one accent colour goes on data (download progress, the selected filter), not on chrome. The main action is an inverted pill.

**Motion** (`motion/react`, wrapped in `MotionConfig reducedMotion="user"`) is feedback: presses, sheets, rows arriving and leaving, the wall reflowing on filter, progress. Animate transform and opacity only.

## 🧪 Tests and CI

- `bun test` in `backend/` (or `bun run test` from the root). The suites use the Vitest-style API (`describe`, `it`, `vi.mock`), which Bun provides; there is no Vitest dependency.
- `tests/setup.js` is preloaded (`bunfig.toml`) and points `EZIARR_DB_DIR`, `EZIARR_LOG_DIR` and `EZIARR_DOWNLOAD_DIR` at a temp directory, removed after the run. Tests never touch `db/`.
- Test files share one process and one database: clean up rows you create, and don't depend on another file or test having run first. `bun test --randomize` should pass.
- CI (`.github/workflows/test.yml`) runs on pushes to `main`/`staging`/`dev` and on PRs: backend tests, then `biome ci` and the frontend build, on Bun 1.4.3 with `--frozen-lockfile`.

## 🐳 Docker

Two stages on `oven/bun:1.4.3-alpine`: build the UI, then install the backend (`--production --frozen-lockfile --ignore-scripts`) and run as the non-root `eziarr` user (uid 100, gid 101) under `pm2-runtime`. A `HEALTHCHECK` curls `/api/v1`. `compose.example.yml` is the reference deployment; `backend/.env.example` lists every environment variable.

`--ignore-scripts` matters. Bun 1.4 runs `bufferutil`/`utf-8-validate`'s native build by default; on Alpine it fails (no musl prebuilds, no compiler) and Bun then deletes both packages, so the Telegram client can't load and the server crashes on boot. Without the script they fall back to pure JS. Pushing to `main` publishes `calypso666/eziarr:<version>` and `:latest`.

## 🛠️ Notes

- **Keep WAL mode.** The server and worker write concurrently; `PRAGMA journal_mode = WAL` is what makes that safe.
- **One writer per log file.** `deadslog` tracks file size within each process, so the server writes `general.log` and the worker `worker.log`.
- **Telegram** is your own account: the session is a `StringSession` in `settings`, created by the in-app login (code, then 2FA if enabled).
- **Passwords** are hashed with Bun's Argon2 (`Bun.password`).
