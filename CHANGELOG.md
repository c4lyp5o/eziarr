# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security
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

### Fixed
- **One offline *Arr no longer takes the UI down:** `GET /missing` and the
  Queue tab return the queues that answered plus an `unavailable` list, and
  the UI says which service isn't answering.
- **Sync saw only the first 100 missing items per service** (and its cleanup
  then deleted the rest). It now pages through the whole list, writes in one
  transaction, and never cleans up from a partial list.
- **Queue progress never reached the UI:** the `/missing` response schema
  stripped the new `progress` field.
- **"Test connection" refused LAN *Arr URLs** (the SSRF guard rejects private
  addresses). The *Arr URLs are the admin's own, so Test now only requires
  http(s).

### Changed
- *Arr queues are fetched once per 5 s and shared by every poll, instead of
  per request (up to ~110 *Arr calls a minute from one open browser).
- Logs rotate at 5 MB (3 files kept), the worker writes its own `worker.log`,
  and the Logs tab reads only the tail of each file, merged by time.
- Download size cap raised from 2 GiB to 5 GiB.
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