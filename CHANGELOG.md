# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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