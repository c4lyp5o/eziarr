# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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