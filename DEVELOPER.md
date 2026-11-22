# eziarr Developer Documentation

How eziarr is put together. For setting up a dev environment, the branch flow and what a PR needs, see [DEVELOPER.md](DEVELOPER.md#contributing); for the traps that have bitten this codebase before, see [AGENTS.md](AGENTS.md).

## 🏗️ Architecture

eziarr is two Bun processes run by PM2 (`ecosystem.config.js`), sharing one SQLite database in WAL mode:

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
| Missing | `GET /missing` (missing items + all queues + `unavailable` services) · `GET /missing/stream` (server-sent events, below) · `POST /missing/search` · `POST /missing/bulk` (`search` or `unmonitor` a selection; one *Arr call per service) · `POST /missing/deepsearch` (Prowlarr) · `POST /missing/forcegrab` · `POST /missing/unmonitor` |
| Downloads | `POST /telegram/import` · `POST /http/import` · `GET /downloads/queue` · `GET /downloads/history` · `GET /downloads/stats` |
| Sources | `GET /telegram/status` · `POST /telegram/auth/send-code` · `POST /telegram/auth/login` · `POST /telegram/search` · `POST /ia/search` · `GET /ia/files/:identifier` · `POST /opendir/scan` |
| Settings & system | `GET`/`POST /settings` · `POST /settings/batch` · `GET /system/status` · `POST /system/test` · `GET /system/tasks` · `GET /system/logs?type=general\|hunter` |

**Telegram search** (`POST /telegram/search`, `backend/match.js`). Telegram matches whole words, so "5 cm" never finds "5cm". The service builds up to 10 searches: the query as typed, spelling variants (number+word joined and split, punctuation and a leading "The" dropped, `&`/"and", part numbers as Roman numerals and back, the episode code as `S01E04`), and the title's original and alternate names read from the *Arr when `service`/`serviceId` are sent. Every file is then scored against all those titles with spacing, punctuation, case and accents ignored, plus or minus for the year and the episode, and the list comes back best first with its `score`. Without `channel` it searches every joined channel (`listChannelIds`), four at a time, skipping any that fail; each file carries its `channel` id and `channelTitle`, and the import uses that id.

**The live stream.** `GET /missing/stream` sends `event: missing` (the list) and `event: queue` (`{ queue, unavailable }`), each only when it changed, and a `: ping` comment otherwise. One 4 s loop in the server feeds every open stream and stops when the last one closes; the 5 s queue cache in `fetchAllQueues` keeps the *Arrs from being asked more often than that, however many tabs are open. Every tick re-checks the access token the stream opened with, so the stream ends when it expires (15 min) or the password changes; the page then refreshes its session and reconnects (`hooks/useLiveMissing.js`).

Response schemas are enforced: Elysia **drops fields a response model doesn't declare**, so a new field needs adding to its model in `models/` or it never reaches the UI. With `NODE_ENV=development`, the OpenAPI UI is served at `/openapi`.

## 🎨 Frontend (`frontend/src/`)

| Path | Role |
| --- | --- |
| `App.jsx` | Shell (top bar, theme and notification toggles), title row, count-card filters, sort and select, the wall; lazy-loads the two sheets and the backdrop. |
| `components/MediaWall.jsx` | The wall, virtualized by row with `@tanstack/react-virtual` against the window scroll: only rows near the screen exist. |
| `components/MediaCard.jsx`, `SeriesCard.jsx` | A title's card (download rail and state, search / deep search / unmonitor) and a series card (several episodes, with the episode list). |
| `components/Poster.jsx` | Shared by both cards: the poster with tilt and fallback, the download rail, the card frame and its selection overlay. |
| `components/BulkBar.jsx` | The action bar of select mode. |
| `components/PosterDrift.jsx` | The three.js backdrop behind sign-in and "All caught up"; lazy, so the wall never loads three.js. |
| `utils/wall.js` | Pure helpers: `isUpcoming`, episode codes, folding episodes into series, sorting. |
| `utils/release.js` | Reads a release name (resolution, source, codec, HDR, audio, camera rips), warns about dead or undersized releases, merges duplicates and orders deep-search results. Tested in `tests/unit/`. |
| `hooks/useLiveMissing.js` | SWR plus the event stream; polls only while the stream is down. |
| `hooks/useArrivals.js` | "Downloaded" toasts and opt-in notifications (remembers titles seen downloading until they leave the list). |
| `hooks/useShortcuts.js` | `/` and Esc. |
| `components/ResultsModal.jsx` + `*Tab.jsx` | Deep search: Indexers, Telegram, Internet Archive, Open directory. |
| `components/SettingsModal.jsx` + `settings/*Tab.jsx` | Settings sheet shell (state and data) and one presentational file per tab. |
| `components/Modal.jsx`, `Tabs.jsx`, `Buttons.jsx`, `Mark.jsx` | Shared primitives: portalled animated dialog, underline tabs, buttons, the logo. |
| `context/Theme.jsx`, `context/Toast.jsx` | Light/dark theme (follows the OS until chosen) and toasts. |
| `ui/styles.js`, `ui/motion.js` | Class recipes and the shared motion presets. |
| `utils/apiCall.js` | `fetch` wrapper; on a 401 it refreshes the session once and retries. |
| `index.css` | Design tokens for both themes (`--ground`, `--surface`, `--ink`, `--accent`, …) exposed to Tailwind as `bg-surface`, `text-ink`, etc. |

**Design rules:** use the tokens, never raw Tailwind palette colours, so both themes work. Surfaces separate by lightness, not borders or shadows (only floating things like dialogs and toasts get a shadow). The one accent colour goes on data (download progress, the selected filter), not on chrome. The main action is an inverted pill.

**The shell is shared with the other ez apps.** The sidebar, mobile drawer and top bar (`.ez-sidebar`, `.ez-topbar` in `index.css`) copy ezllm's shell exactly, so the chrome looks and moves the same in every ez app. They pin ezllm's ink, mute, hover and red values on those selectors, which keeps eziarr's own palette out of the chrome. The selection mark is a 1px accent line that slides between items on `shellSpring`, and the drawer takes over below 1024px. The favicon, PWA icons and logo are the shared ez mark. Change the shell in ezllm first, then copy it here; don't restyle it locally.

**Motion** (`motion/react`, wrapped in `MotionConfig reducedMotion="user"`) is feedback: presses, sheets, rows arriving and leaving, progress, the poster tilt. Animate transform and opacity only. The wall's cards don't animate in and out: with thousands of titles that cost seconds per filter change.

**The wall must stay virtualized.** Don't render every title (a library can miss thousands), and keep what's derived from the list (filtering, grouping, sorting) in a `useMemo` that doesn't depend on the queue, which changes every few seconds while anything downloads.

`public/` holds the PWA manifest, icons and `sw.js`. The service worker only shows notifications; it has no fetch handler and caches nothing, so a deploy is never hidden behind a stale cache.

## 🧪 Tests and CI

- `bun test` in `backend/` (or `bun run test` from the root). The suites use the Vitest-style API (`describe`, `it`, `vi.mock`), which Bun provides; there is no Vitest dependency.
- `tests/setup.js` is preloaded (`bunfig.toml`) and points `EZIARR_DB_DIR`, `EZIARR_LOG_DIR` and `EZIARR_DOWNLOAD_DIR` at a temp directory, removed after the run. Tests never touch `db/`.
- Test files share one process and one database: clean up rows you create, and don't depend on another file or test having run first. `bun test --randomize` should pass.
- **Frontend unit tests** (`bun run test:unit` in `frontend/`): pure helpers such as the release-name parser.
- **Browser smoke test** (`frontend/tests/smoke.test.js`, `bun run smoke` after `bun run build`): starts `tests/mock-api.js` (a mock of the API with 600 titles) and `vite preview`, then drives Chrome over the DevTools protocol (`tests/cdp.js`; set `CHROME_BIN` if Chrome isn't on the path). It covers sign-in, the virtualized wall, series cards, filters, sorting, shortcuts, select mode and a download finishing over the stream. The mock is also handy for UI work: `bun tests/mock-api.js` and `bun run dev` (see the header of the file for its switches).
- CI (`.github/workflows/test.yml`) runs on pull requests and pushes to `development`: backend tests, then `biome ci`, the unit tests, the frontend build and the smoke test, on Bun 1.4.5 with `--frozen-lockfile`, plus the image built, booted and checked healthy. `publish.yml` runs it before every publish.

## 🐳 Docker

Two stages on `oven/bun:1.4.5-alpine` (the ez standard Dockerfile): build the UI, then install the backend (`--production --frozen-lockfile --ignore-scripts`) and run as the non-root `bun` user (uid 1000) under `pm2-runtime`. A `HEALTHCHECK` fetches `/api/v1` with wget. `compose.example.yml` is the reference deployment; `backend/.env.example` lists every environment variable.

`--ignore-scripts` matters. Bun 1.4 runs `bufferutil`/`utf-8-validate`'s native build by default; on Alpine it fails (no musl prebuilds, no compiler) and Bun then deletes both packages, so the Telegram client can't load and the server crashes on boot. Without the script they fall back to pure JS. Pushing to `main` publishes `calypso666/eziarr:<version>` and `:latest`.

## 🛠️ Notes

- **Keep WAL mode.** The server and worker write concurrently; `PRAGMA journal_mode = WAL` is what makes that safe.
- **One writer per log file.** `deadslog` tracks file size within each process, so the server writes `general.log` and the worker `worker.log`.
- **Telegram** is your own account: the session is a `StringSession` in `settings`, created by the in-app login (code, then 2FA if enabled).
- **Passwords** are hashed with Bun's Argon2 (`Bun.password`).

## Commands

| Task | Command |
| --- | --- |
| Install every package | `bun run install` |
| Run the dev servers | `bun run dev` |
| Run the test suite | `bun run test` |
| Lint with Biome | `bun run lint` |
| Apply Biome's safe fixes | `bun run lint:fix` |
| Build the frontend | `bun run build:client` |
| Start in production (PM2 where configured) | `bun run start` |

`bun run test` runs the backend suite; `cd frontend && bun run test:unit` the frontend units; `cd frontend && bun run smoke` a real-browser smoke test after a build.

## Linting

[Biome](https://biomejs.dev) 2.6.8 is the only linter. It is pinned at the repo root, so run it from there: `bun run lint` checks, `bun run lint:fix` applies safe fixes. Configuration is `biome.json`; the root config only lints, while `frontend/biome.json` (a nested config) also enforces formatting there, and CI runs `bunx biome ci frontend`. CI runs the same command.

## Branches and releases

There are two long-lived branches:

| Branch | Role |
| --- | --- |
| `development` | Integration branch. Branch from it (`feat/…`, `fix/…`, `chore/…`) and open every PR against it. |
| `master` | Released code. Only `development` is merged into it, by PR. |

No other long-lived branches (`main`, `dev`, `staging`, …) are kept; delete feature branches once merged.

To release: bump the version in `package.json`, `backend/package.json` and `frontend/package.json`, move the `[Unreleased]` notes in `CHANGELOG.md` under `## [x.y.z] - YYYY-MM-DD`, then merge `development` into `master`. Every push to `master` runs `publish.yml`: `test.yml` first, then `calypso666/eziarr:<version>`, `:latest` and `:sha-<commit>` (Docker Hub). Tagging `vX.Y.Z` afterwards is optional: it checks the tag matches `package.json`, pushes `:<version>` and creates a GitHub Release from that version's changelog section. `development` publishes nothing.

Commits follow [Conventional Commits](https://www.conventionalcommits.org) (`fix(scope): …`) with a body that explains why. Add a `CHANGELOG.md` line under `[Unreleased]` for anything a user would notice. Every behaviour change needs a test; a bug fix needs one that fails without the fix.

## Docker

The image follows the ez standard Dockerfile: a Bun stage builds the frontend, then `oven/bun:1.4.5-alpine` runs the app as `bun` (uid 1000) with a `HEALTHCHECK` on `/api/v1`. Keep the Bun version in step with `bun-version` in `.github/workflows/`. `test.yml` builds the image, boots it and waits for healthy; do the same locally (`docker build -t eziarr .`, then `docker run`) after changing the Dockerfile.

## Contributing

Thanks for helping. This page covers running eziarr locally, how changes flow into a release, and what a pull request needs. How the code is organised is in [DEVELOPER.md](DEVELOPER.md).

### Running it locally

You need [Bun](https://bun.sh) 1.4 and, to try it end to end, at least one of Radarr, Sonarr or Lidarr.

```bash
bun run install        # backend + frontend dependencies
bun run dev            # server, worker and Vite together
```

- The UI runs on <http://localhost:3000> (Vite, proxying `/api` to the server on port 5000).
- On first start the server prints a setup code in the terminal. To skip it in development, start with a password instead: `EZIARR_PASSWORD=devpassword bun run dev`.
- Data lives in `db/`, `logs/` and `downloads/` at the repo root; delete `db/` to start over.

### Before you open a pull request

```bash
cd backend  && bun test              # all backend tests
bunx biome ci frontend              # Biome (from the root): lint + formatting
cd frontend && bun run build         # the UI still builds
cd frontend && bun run smoke         # the built UI in headless Chrome
```

CI runs the same checks on every pull request.

- **Tests come with the change.** A bug fix gets a test that fails without it; a feature gets tests for its behaviour. Mock external services (`vi.mock("axios", …)`); never call a real *Arr from a test.
- **Tests stand alone.** They run against a throwaway database (the preload in `tests/setup.js` sees to that), but every file shares it: clean up rows you create, and don't rely on another test running first. `bun test --randomize` should pass.
- **Format with Biome** from the root: `bunx biome check --write frontend`.
- **Add a line to `CHANGELOG.md`** under `## [Unreleased]` for anything a user would notice.
- **Keep a pull request to one change.** Separate refactors from behaviour changes, and dependency bumps from both.


### Commit messages

[Conventional Commits](https://www.conventionalcommits.org), as in the existing history:

```
fix(import): scan the downloaded FILE path, not the drop folder

Why the change was needed and what it does, wrapped at ~72 columns.
```

Types: `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `style`, `build`, `ci`, `chore`. The scope is the area (`import`, `sync`, `settings`, `ui`, `security`, …).

### Dependencies

- Update one dependency, or one closely related group, per change, and say why.
- Prefer releases that are at least a week old; brand-new releases are where regressions and compromised packages show up first.
- Commit the lockfile and read its diff. CI and the Docker build install with `--frozen-lockfile`, so the lockfile is what ships.

### Reporting security issues

Please don't open a public issue for a vulnerability. Use GitHub's private vulnerability reporting (the repository's **Security** tab → **Report a vulnerability**), or email `calypso[at]calypsocloud.one`. Include what an attacker can do and how to reproduce it.
