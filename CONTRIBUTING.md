# Contributing to Eziarr

Thanks for helping. This page covers running Eziarr locally, how changes flow into a release, and what a pull request needs. How the code is organised is in [DEVELOPER.md](DEVELOPER.md).

## Running it locally

You need [Bun](https://bun.sh) 1.4 and, to try it end to end, at least one of Radarr, Sonarr or Lidarr.

```bash
bun run install        # backend + frontend dependencies
bun run dev            # server, worker and Vite together
```

- The UI runs on <http://localhost:3000> (Vite, proxying `/api` to the server on port 5000).
- On first start the server prints a setup code in the terminal. To skip it in development, start with a password instead: `EZIARR_PASSWORD=devpassword bun run dev`.
- Data lives in `db/`, `logs/` and `downloads/` at the repo root; delete `db/` to start over.

## Before you open a pull request

```bash
cd backend  && bun test              # all backend tests
cd frontend && bun run check         # Biome: lint + formatting
cd frontend && bun run build         # the UI still builds
cd frontend && bun run smoke         # the built UI in headless Chrome
```

CI runs the same checks on every pull request.

- **Tests come with the change.** A bug fix gets a test that fails without it; a feature gets tests for its behaviour. Mock external services (`vi.mock("axios", …)`); never call a real *Arr from a test.
- **Tests stand alone.** They run against a throwaway database (the preload in `tests/setup.js` sees to that), but every file shares it: clean up rows you create, and don't rely on another test running first. `bun test --randomize` should pass.
- **Format with Biome** (`bunx biome check --write` in `frontend/`).
- **Add a line to `CHANGELOG.md`** under `## [Unreleased]` for anything a user would notice.
- **Keep a pull request to one change.** Separate refactors from behaviour changes, and dependency bumps from both.

## Branches and releases

Changes flow **feature branch → `dev` → `staging` → `main`**:

1. Branch from `dev` (`fix/…`, `feat/…`, `chore/…`) and open the PR against `dev`.
2. `dev` is promoted to `staging`, and `staging` to `main`, each by a PR.
3. A release bumps the version in `package.json`, `backend/package.json` and `frontend/package.json` and dates the `[Unreleased]` section of the changelog (a `chore: bumpver to x.y.z` PR).
4. A push to `main` builds and publishes the Docker image `calypso666/eziarr:<version>` and `:latest`.

An urgent fix (a security hole, say) may go straight to `main` in a release PR; afterwards, merge `main` back into `staging` and `dev` so the next change starts from current code.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org), as in the existing history:

```
fix(import): scan the downloaded FILE path, not the drop folder

Why the change was needed and what it does, wrapped at ~72 columns.
```

Types: `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `style`, `build`, `ci`, `chore`. The scope is the area (`import`, `sync`, `settings`, `ui`, `security`, …).

## Dependencies

- Update one dependency, or one closely related group, per change, and say why.
- Prefer releases that are at least a week old; brand-new releases are where regressions and compromised packages show up first.
- Commit the lockfile and read its diff. CI and the Docker build install with `--frozen-lockfile`, so the lockfile is what ships.

## Reporting security issues

Please don't open a public issue for a vulnerability. Use GitHub's private vulnerability reporting (the repository's **Security** tab → **Report a vulnerability**), or email `calypso[at]calypsocloud.one`. Include what an attacker can do and how to reproduce it.
