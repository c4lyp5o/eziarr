# AGENTS.md

Guidance for AI coding agents (and humans in a hurry) working on Eziarr. Architecture is in [DEVELOPER.md](DEVELOPER.md); workflow and PR requirements are in [CONTRIBUTING.md](CONTRIBUTING.md).

## Commands

| Task | Command |
| --- | --- |
| Install | `bun run install` (root; installs backend and frontend) |
| Dev (server + worker + UI) | `bun run dev` — UI on :3000, API on :5000; `EZIARR_PASSWORD=devpassword` skips the setup code |
| Backend tests | `cd backend && bun test` (`--randomize` to catch order dependence) |
| One test file | `cd backend && bun test tests/import.test.js` |
| Frontend lint + format check | `cd frontend && bun run check` (`bunx biome check --write` to fix) |
| Frontend build | `cd frontend && bun run build` (writes `../client`) |

Use Bun, not npm/node, for everything. There is no Vitest package: `bun test` provides the `vitest` imports.

## Rules that exist because they were broken

1. **Elysia hooks must be scoped.** A `derive`/`onTransform`/`onBeforeHandle` inside a plugin is local to that plugin unless declared `{ as: "scoped" }`. Unscoped auth hooks left every API route public until 1.4. `tests/protected-routes.test.js` walks every route; if you add a public route, add it to `PUBLIC` there deliberately.
2. **Response models strip undeclared fields.** A field you add to a response must also be added to its TypeBox model in `backend/models/`, or Elysia drops it silently. Test new fields through the real route (`app.handle(...)`), not only the service.
3. **Tests never touch real data.** The preload points `EZIARR_DB_DIR`/`LOG_DIR`/`DOWNLOAD_DIR` at a temp dir; don't bypass `config.js` paths. All test files share one database: clean up rows you create and don't rely on test order.
4. **Prove a test catches the bug.** Undo the fix, watch the test fail, restore. A test that passes either way is not a regression test.
5. **Talk to the *Arrs only through `arr(config, service)`** (`backend/arr.js`). It knows Lidarr/Prowlarr are API v1. Hard-coding `/api/v3` broke Lidarr force-grab.
6. **All SQL lives in `backend/db.js`.** Multi-row writes go in a `db.transaction`.
7. **Import scans target the downloaded file path, not the folder.** A folder-path `DownloadedMoviesScan` completes on Radarr 6.x but imports nothing. Don't "fix" this back without re-measuring on a live Radarr.
8. **Never clean up from a partial list.** Sync removes titles an *Arr no longer lists only when that *Arr's whole list (every page) arrived.
9. **One process per log file.** `deadslog` tracks size within a process; the server writes `general.log`, the worker `worker.log`.
10. **Docker installs use `--frozen-lockfile`; the backend also uses `--ignore-scripts`.** Bun 1.4 otherwise deletes `bufferutil` on Alpine and the server crashes on boot. Smoke-test a built image after changing the Dockerfile or the Bun version.
11. **No top-level `await` in `backend/index.js` or `worker.js`.** PM2 loads them with `require()`, which Bun refuses when a top-level await really suspends; the server crash-looped in 1.4.0. `tests/pm2-load.test.js` loads `index.js` the PM2 way. Likewise, don't detect the process from `Bun.main` (under PM2 it's PM2's wrapper); use `EZIARR_ROLE` from `ecosystem.config.js`.
12. **Frontend colours come from tokens** (`bg-surface`, `text-ink`, `text-muted`, `bg-accent`, … in `src/index.css`), never raw Tailwind palette classes, so light and dark both work. Motion animates transform and opacity only.

## Conventions

- Commits: Conventional Commits (`fix(scope): …`), with a body explaining why. Add a `CHANGELOG.md` line under `[Unreleased]` for user-visible changes.
- Match the surrounding code: tabs, double quotes, comments that explain *why*, not *what*.
- Dependencies: prefer releases at least a week old; review the lockfile diff.
- Security-relevant code (auth, the SSRF guard in `utils.js`, download paths) changes only with tests that pin the behaviour.

## Working on this machine

- Stop background processes you started **by PID or task ID**. Don't `pkill -f` by pattern: other services here (including Docker containers) match patterns like `server.js`.
- Don't point tests or scripts at a running Eziarr instance; build an image and run it on a spare port, or start `bun index.js` with the `EZIARR_*_DIR` variables set to a temp directory.
