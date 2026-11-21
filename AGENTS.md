# AGENTS.md

Guidance for AI coding agents working on eziarr, one of the ez* self-hosted apps. **ez rules** are shared by every ez repo; **This repo** is specific to eziarr. Humans: [DEVELOPER.md](DEVELOPER.md) has the same commands with more context.

<!-- ez-standard:start v1 — shared by every ez repo; edit the copy in the Hermes ez-series skill and re-sync, not this block. -->
## ez rules (shared by every ez repo)

### Ground rules

1. **No commits, pushes, PRs, tags, releases or deploys without the owner's explicit OK.** Patch, test, report.
2. **Never print, log or commit secrets.** No tokens, passwords, keys or webhook URLs in code, fixtures, logs, chat or commit messages. `.env` is never committed and never copied into an image.
3. **Never report a check as passing unless you ran it.** Quote the real output and numbers; a skipped check is not a pass.
4. **Tests never touch real data or real services.** Use temp dirs, throwaway database containers and mocked HTTP. Never point a test at a running instance.
5. **Prove a regression test catches the bug.** Undo the fix, watch the test fail, restore it.

### Branches and releases

- `development` is the integration branch. Branch from it (`feat/…`, `fix/…`, `chore/…`) and open every PR against it.
- `master` is released code. Only `development` merges into it, by PR. There is no `main`, `dev` or `staging`.
- Release (only with the owner's OK): bump every `package.json` version, move `[Unreleased]` in `CHANGELOG.md` under `## [x.y.z] - YYYY-MM-DD`, merge `development` into `master`. Merging to `master` publishes the image.
- Conventional Commits (`fix(scope): …`) with a body that says why. User-visible changes get a `CHANGELOG.md` line under `[Unreleased]`.

### Stack and style

- **Bun for everything**, never npm or node. The Bun version in `Dockerfile` (`oven/bun:x.y.z`) and every `bun-version:` in `.github/workflows/` must match.
- ESM, tabs, double quotes, semicolons. Minimal, task-scoped diffs; don't reformat files you didn't change. Comments explain why, not what.
- **Biome is the only linter**, pinned at the repo root: `bun run lint`, `bun run lint:fix`. No ESLint or Prettier. Markdown is not run through Biome.
- **Frontend**: React + Vite + Tailwind 4 in the ez house style (shared `src/ez/` kit and tokens; ezllm is the reference). Colours come from tokens, never raw palette classes. Motion animates transform and opacity only.
- **Icons**: every app uses the shared ez icon from ezconv: `public/icons/icon-192.png` and `icon-512.png`, linked as `rel="icon"` and `rel="apple-touch-icon"` and used in any web manifest.
- **React Compiler** runs through `@rolldown/plugin-babel` with `reactCompilerPreset()`. `@vitejs/plugin-react` 6 has no `babel` option; passing one silently disables the compiler.

### Dependencies

- Lockfiles are committed. CI and Docker install with `--frozen-lockfile`. Don't touch a lockfile unless the dependency change is intentional, and review its diff.
- Prefer releases at least a week old. Take majors one at a time and keep one only if lint, tests and build pass. Read the changelog for removed exports and options; a passing build is not proof (archiver 8 and plugin-react 6 both passed builds while breaking the app).

### Docker

- Images run unprivileged as `bun` (uid 1000). Every writable directory (data, uploads, logs) is created and `chown`ed in the `Dockerfile`; never write to a relative path.
- Configuration comes from the environment at runtime (`env_file` in compose). Never `COPY .env`.
- After changing the `Dockerfile`, the Bun version or a dependency, build the image and boot it with throwaway config. Tests don't load every entry point (workers especially).

### Before you say it's done

Run the lint, tests and build listed under **This repo** and report the numbers. For UI changes, also check the page in a real browser at 390px and desktop widths.
<!-- ez-standard:end -->

## This repo

### Commands

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

### Repo guide (kept from the previous AGENTS.md)

Guidance for AI coding agents (and humans in a hurry) working on Eziarr. Architecture is in [DEVELOPER.md](DEVELOPER.md); workflow and PR requirements are in [DEVELOPER.md](DEVELOPER.md#contributing).

### Commands

| Task | Command |
| --- | --- |
| Install | `bun run install` (root; installs backend and frontend) |
| Dev (server + worker + UI) | `bun run dev` — UI on :3000, API on :5000; `EZIARR_PASSWORD=devpassword` skips the setup code |
| Backend tests | `cd backend && bun test` (`--randomize` to catch order dependence) |
| One test file | `cd backend && bun test tests/import.test.js` |
| Lint + format check | `bun run lint` at the root; `bunx biome ci frontend` for the frontend's formatting (`bunx biome check --write frontend` to fix) |
| Frontend build | `cd frontend && bun run build` (writes `../client`) |
| Frontend unit tests | `cd frontend && bun run test:unit` |
| Browser smoke test | `cd frontend && bun run smoke` (after a build; needs Chrome, `CHROME_BIN` to pick one) |
| UI against fake data | `cd frontend && bun tests/mock-api.js` then `bun run dev` (`COUNT=3000` for a large library) |

Use Bun, not npm/node, for everything. There is no Vitest package: `bun test` provides the `vitest` imports.

### Rules that exist because they were broken

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
13. **The wall stays virtualized.** 1.4.1 rendered every title: 3000 cards took 5 s to appear and 12 s per filter change. Keep `MediaWall`, and keep derived lists in a `useMemo` that doesn't depend on the queue.

### Conventions

- Commits: Conventional Commits (`fix(scope): …`), with a body explaining why. Add a `CHANGELOG.md` line under `[Unreleased]` for user-visible changes.
- Match the surrounding code: tabs, double quotes, comments that explain *why*, not *what*.
- Dependencies: prefer releases at least a week old; review the lockfile diff.
- Security-relevant code (auth, the SSRF guard in `utils.js`, download paths) changes only with tests that pin the behaviour.

### Working on this machine

- Stop background processes you started **by PID or task ID**. Don't `pkill -f` by pattern: other services here (including Docker containers) match patterns like `server.js`.
- Don't point tests or scripts at a running Eziarr instance; build an image and run it on a spare port, or start `bun index.js` with the `EZIARR_*_DIR` variables set to a temp directory.
