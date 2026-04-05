# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2026-04-05

### Security
- **Argon2 Hashing:** Replaced plain-text password storage with Bun's native Argon2 password hashing.
- **API Sanitization:** Prevented the `/api/v1/settings` endpoint from exposing the admin password and Telegram MTProto session strings to the frontend.
- **SSRF Hardening:** Implemented a custom `node:http` Agent to validate DNS resolution at the socket level, neutralizing DNS-rebinding attacks.
- **Redirect Blocks:** Disabled Axios auto-redirects in the Open Directory scanner to prevent local network traversal.
- **Validation:** Added strict 8-character minimum length requirements to the Settings API schema.

### Changed
- **Settings UI:** Improved the conditional rendering of the *Arr "Test Connection" buttons to only appear when credentials are changed.
- **Internet Archive:** Replaced raw Axios stack-trace crashes with graceful warnings when archive.org returns 503 errors.

### Fixed
- **Telegram Search:** Implemented dual-query auto-correction to handle the `&` vs `and` discrepancy in Telegram channel scraping.
- **Radarr Imports:** Fixed an issue where Indexer torrents with unrecognizable names were rejected by injecting metadata directly into the push payload.
- **File Extensions:** Fixed a critical file-parsing bug where files without extensions caused the app to append the entire filename as the extension. Safely falls back to `.mkv` or `.mp3`.
- **JWT Amnesia:** Fixed a bug where restarting the Docker container invalidated all active sessions by persisting the JWT Secret to the SQLite database.
- **Auth Crash:** Fixed an Elysia context error where `status()` was called instead of `error()`, preventing 500 crashes on failed logins.
- **Settings Overwrite:** Fixed a bug where saving settings would inadvertently overwrite the newly hashed password with plain text.
- **React Warnings:** Fixed an "uncontrolled to controlled input" React warning in the Settings Modal.

## [1.0.0] - 2026-03-19

### Added
- **Enterprise Authentication:** First-time setup wizard to create an admin account.
- **HttpOnly Cookies:** Transitioned from `sessionStorage` to secure HttpOnly JWT cookies with automated background refresh cycles.
- **SSRF Protection:** Built-in DNS and IP validation in the HTTP downloader to prevent Server-Side Request Forgery attacks.
- **Custom UI Modals:** Replaced native browser alerts with beautifully styled React modals (e.g., Unmonitor confirmation).
- **Settings Credentials Management:** Users can now securely update their admin username and password directly from the Settings UI.
- **Comprehensive Test Suite:** Added Vitest suites covering the Auth Lifecycle, SQLite IPC Queue, external *Arr mocking, and Security utilities.
- **Multi-Stage Docker Build:** Automated the compilation of the React frontend into the Bun backend container for seamless deployments.

### Changed
- **Massive MVC Refactor:** Shattered the backend monolith into a scalable architecture using `/routes`, `/services`, `/models`, and `/plugins`.
- **ElysiaJS Validation:** Integrated strict TypeBox schema validation on all incoming API requests.
- **React Frontend:** Upgraded UI to use `same-origin` fetch configurations for secure cookie transmission.
- **Loading States:** Implemented skeleton UI loaders for the Settings Modal to prevent visual layout shifts.

### Fixed
- **SQLite Database:** Resolved issues with missing columns triggering `null` values during queue finalization.
- **Telegram Auth:** Fixed a bug where Telegram 2FA logic threw unhandled exceptions during login.
- **Elysia Security Fall-through:** Guarded all API routes safely behind `ProtectorPlugin` without breaking static frontend file serving.
- **Logout Bug:** Explicitly forcing maxAge expiration on cookies to ensure users aren't silently logged back in via the refresh interceptor.