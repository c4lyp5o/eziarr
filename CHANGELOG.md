# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.5.0] - 2026-10-22

### Added
- **Series cards:** when two or more episodes of a show are missing, they
  fold into one card. "Search all" searches every episode at once; the
  card opens the episode list, with search, deep search and stop
  monitoring per episode, or for all of them.
- **"Not out yet" filter:** titles not released yet (or with no date) are
  counted and listed apart. "All missing" and the movie, episode and album
  counts now cover only what a search can find.
- **Sorting:** newest first, oldest first or title A–Z, remembered per
  browser.
- **Select mode:** pick titles (or whole series) and search for, or stop
  monitoring, all of them at once. New API: `POST /api/v1/missing/bulk`,
  one *Arr call per service.
- **Live updates:** the wall follows a server-sent event stream
  (`GET /api/v1/missing/stream`) instead of downloading the whole list
  every 10 seconds; it falls back to polling when the stream is down.
- **"Downloaded" toasts**, and opt-in system notifications (the bell in
  the top bar) while Eziarr is open in the background. Needs HTTPS.
- **Install as an app:** a web app manifest and icons.
- **Shortcuts:** `/` jumps to search; Esc clears it or leaves select mode.
- **Sign-in backdrop:** blank poster cards drift slowly towards you behind
  the sign-in and setup forms, and more calmly behind "All caught up"
  (three.js, loaded only on those screens). It holds still for reduced
  motion and is skipped without WebGL.
- **Poster tilt:** with a mouse, a poster leans towards the pointer and
  catches a soft light.
- **Deep search results say what each release is:** badges read from the
  name (resolution, source, codec, HDR, audio, multi-audio, subs), peers,
  grabs, age, freeleech and a link to the indexer's page. Camera rips,
  dead torrents and files too small for their resolution are flagged and
  sorted last; the same release on several indexers is one row. Order by
  best, seeders, newest or size.
- **Smarter Telegram search:** the search box is editable, and Eziarr also
  searches the other ways a name gets written ("5 cm" / "5cm", "Part 2" /
  "Part II", S1E4 / S01E04) and the original and alternate titles from
  Radarr, Sonarr or Lidarr. Files come back ranked by how well they match,
  with the best match marked and weak ones dimmed.
- **Browser smoke test in CI**, against a mock API, and frontend unit tests.

### Changed
- **The wall renders only the rows on screen.** With 3000 missing titles
  it now shows in about 0.7 s instead of 5 s, and a filter change takes
  about 0.15 s instead of 12 s. Cards no longer animate in and out when
  the filter changes.
- Episode cards show the episode code ("S02E07") under the series name
  instead of repeating the series name.

### Fixed
- **Force-grabbing a Usenet result** told the *Arr it was a torrent, so
  the NZB went to the torrent client. The release's protocol is now passed
  through.

## [1.4.1] - 2026-10-22

### Fixed
- **Server crash-loop with `EZIARR_PASSWORD`:** PM2 loads the server with
  `require()`, and the top-level `await` added for first-boot setup made
  Bun refuse it whenever setup really had to wait (hashing the env
  password). Fresh installs using `EZIARR_PASSWORD` never came up.
  Installs with a password already set, or using the setup code, were not
  affected.
- **The worker still wrote `general.log` under PM2:** it was told apart by
  its entry file, which under PM2 is PM2's wrapper. `ecosystem.config.js`
  now sets `EZIARR_ROLE=worker`, so it writes `worker.log` as intended.

## [1.4.0] - 2026-10-22

> **Upgrading:** behind a reverse proxy, set `TRUST_PROXY=1` (see Security).
> A fresh install now asks for a one-time setup code from the server log.

### Security
- **CRITICAL: the API required no login.** The auth plugins' hooks were
  local to the plugins (Elysia hooks are unscoped by default), so the
  session check never ran for the routes it was meant to guard: anyone who
  could reach Eziarr could read settings and logs, start downloads, and set
  a new password through `POST /settings/batch`. Present since the plugin
  refactor (354f9f9). Both hooks are now `scoped`, and a test walks every
  API route and requires a 401 without a session.
- **First-boot setup code:** setting the initial password now needs a
  one-time code printed on the server console, so an exposed fresh install
  can't be claimed by whoever reaches it first. `EZIARR_PASSWORD` /
  `EZIARR_PASSWORD_FILE` skip it.
- **Login rate limit could be bypassed** by sending a fresh `X-Forwarded-For`
  per request: the leftmost (client-controlled) entry was trusted whenever the
  peer had a private IP. The header is now ignored unless `TRUST_PROXY` is
  set, and then the entry the trusted proxy appended is used.
  **Behaviour change:** behind a reverse proxy, set `TRUST_PROXY=1`, or all
  clients share the proxy's rate-limit bucket.
- **Password change revokes sessions:** tokens carry a session version that a
  password change bumps; the caller is re-issued a session.
- Refresh tokens are no longer accepted as access tokens.
- `POST /settings` enforces the 8-character password minimum.
- The session is checked before the request body is validated, so a caller
  without one always gets 401 rather than a validation error.
- The download URL guard covers more internal ranges (benchmarking,
  multicast, reserved, Teredo, local NAT64) and checks the IPv4 address
  behind IPv4-mapped, NAT64 and 6to4 IPv6 addresses; IPv6 literals are now
  actually evaluated.
- A download never overwrites a file another queued job is still waiting to
  import; it is numbered instead.

### Fixed
- **One offline *Arr no longer takes the UI down:** `GET /missing` and the
  Queue tab return the queues that answered plus an `unavailable` list, and
  the UI says which service isn't answering.
- **Sync saw only the first 100 missing items per service** (and its cleanup
  then deleted the rest). It now pages through the whole list, writes in one
  transaction, and never cleans up from a partial list.
- **Queue progress never reached the UI:** the `/missing` response schema
  stripped the new `progress` field.
- **Force-grab's temporary Radarr profile** now copies the "Any" quality
  profile, reclaims a temp profile left by an earlier run, and force-grabs
  run one at a time per service so they can't delete it from under each
  other.
- **"Test connection" refused LAN *Arr URLs** (the SSRF guard rejects private
  addresses). The *Arr URLs are the admin's own, so Test now only requires
  http(s).

### Changed
- *Arr queues are fetched once per 5 s and shared by every poll, instead of
  per request (up to ~110 *Arr calls a minute from one open browser).
- Logs rotate at 5 MB (3 files kept), the worker writes its own `worker.log`,
  and the Logs tab reads only the tail of each file, merged by time.
- Download size cap raised from 2 GiB to 5 GiB.
- Docs: README rewritten for 1.4 (Docker Compose setup, configuration,
  security, upgrade notes) with new screenshots; DEVELOPER.md brought up to
  date; new CONTRIBUTING.md and AGENTS.md (CLAUDE.md imports it).
- Tests run with `bun test` (Vitest removed) against a throwaway database;
  the data directories can be moved with `EZIARR_DB_DIR`, `EZIARR_LOG_DIR`
  and `EZIARR_DOWNLOAD_DIR`. CI runs the tests and the frontend build.
- Frontend dependencies updated (Vite 8.3.4 clears the dev-server advisories).
- Queue items from `GET /missing` carry a `progress` field (0-100 or null).
- New UI with a light/dark theme toggle and motion.

## [1.3.0] - 2026-10-04

### Fixed
- **Telegram/HTTP download import:** scan now targets the downloaded FILE path
  again (Radarr 6.4.4 folder-path scans complete but silently import nothing;
  measured live 2026-10-04). Reverts the scan-target half of commit 9bff467;
  keeps its import verification (hasFile polling).

## [1.0.2] - 2026-04-05

### Added
- **App Updates:** Added an indicator in the UI when a new version of Eziarr is available.

### Fixed
- **Telegram Search:** Better handling of edge cases in Telegram search queries, including more aggressive punctuation stripping and additional query permutations to improve hit rates on channels with inconsistent naming conventions. Also added original message text for easier matching.

## [1.0.1] - 2026-04-05

### Added
- **SSRF Hardening:** Implemented a custom `node:http` Agent to validate DNS resolution at the socket level, neutralizing DNS-rebinding attacks.
- **Redirect Blocks:** Disabled Axios auto-redirects in the Open Directory scanner to prevent local network traversal.
- **Validation:** Added strict 8-character minimum length requirements to the Settings API schema.

### Changed
- **Argon2 Hashing:** Replaced plain-text password storage with Bun's native Argon2 password hashing.
- **API Sanitization:** Prevented the `/api/v1/settings` endpoint from exposing the admin password and Telegram MTProto session strings to the frontend.
- **Settings UI:** Improved the conditional rendering of the *Arr "Test Connection" buttons to only appear when credentials are changed.
- **Internet Archive:** Replaced raw Axios stack-trace crashes with graceful warnings when archive.org returns 503 errors.

### Fixed
- **Telegram Search:** Implemented dual-query auto-correction to handle the `&` vs `and` discrepancy in Telegram channel scraping.
- **Radarr Imports:** Fixed an issue where Indexer torrents with unrecognizable names were rejected by injecting metadata directly into the push payload.
- **File Extensions:** Fixed a critical file-parsing bug where files without extensions caused the app to append the entire filename as the extension. Safely falls back to `.mp4` or `.mp3`.
- **JWT Amnesia:** Fixed a bug where restarting the Docker container invalidated all active sessions by persisting the JWT Secret to the SQLite database.
- **Settings Overwrite:** Fixed a bug where saving settings would inadvertently overwrite the newly hashed password with plain text.
- **React Warnings:** Fixed an "uncontrolled to controlled input" React warning in the Settings Modal.

## [1.0.0] - 2026-03-19

### Added
- **First-Time Setup:** First-time setup wizard to create an admin account.
- **HttpOnly Cookies:** Transitioned from `sessionStorage` to secure HttpOnly JWT cookies with automated background refresh cycles.
- **SSRF Protection:** Built-in DNS and IP validation in the HTTP downloader to prevent Server-Side Request Forgery attacks.
- **Custom UI Modals:** Replaced native browser alerts with modals.
- **Settings Credentials Management:** Users can now update their admin username and password directly from the Settings UI.
- **Test Suite:** Added Vitest suites covering the Auth Lifecycle, SQLite IPC Queue, external *Arr mocking, and Security utilities.


### Changed
- **MVC Refactor:** Shattered the backend monolith into a scalable architecture using `/routes`, `/services`, `/models`, and `/plugins`.
- **ElysiaJS Validation:** Integrated strict TypeBox schema validation on all incoming API requests.
- **React Frontend:** Upgraded UI to use `same-origin` fetch configurations for secure cookie transmission.
- **Loading States:** Implemented skeleton UI loaders for the Settings Modal to prevent visual layout shifts.

### Fixed
- **SQLite Database:** Resolved issues with missing columns triggering `null` values during queue finalization.
- **Telegram Auth:** Fixed a bug where Telegram 2FA logic threw unhandled exceptions during login.
- **Elysia Security Fall-through:** Guarded all API routes safely behind `ProtectorPlugin` without breaking static frontend file serving.
- **Logout Bug:** Explicitly forcing maxAge expiration on cookies to ensure users aren't silently logged back in via the refresh interceptor.

## pre-1.0.0 - before 2026-03-19

### Added
- Initial project setup and development. See individual commit history for details.