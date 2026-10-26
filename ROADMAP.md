# Eziarr roadmap

> Untracked working draft, written 2026-10-23 after 1.5.1. Dates are
> targets, not promises; every line here is open to change.

## Where Eziarr is

Eziarr began (1.0, March 2026) as a list of what Radarr, Sonarr and Lidarr
are missing, with a few places to look when the indexers fail. By 1.5 it is:

- a fast wall of everything missing (virtualized, live over SSE, series
  folded into one card, bulk actions);
- a hunter that keeps re-asking the indexers;
- deep search across Prowlarr, Telegram (every channel, ranked by match),
  the Internet Archive and open directories;
- a download queue and worker that rename files the way the *Arr expects
  and import them with a targeted scan;
- hardened along the way: real auth, the SSRF guard, Argon2, first-boot
  setup code, session revocation.

What it is not yet: it waits for a person to click. Every non-indexer
source is a separate tab with its own code path, nothing checks that a
downloaded file is really what it claims to be, and the only tests against
real *Arrs are the ones done by hand.

## Where it is going

**From "a list of what's missing" to "the thing that finishes your
library".** The *Arrs handle the common case: a release on an indexer.
Eziarr owns everything after that fails: finding the file wherever it
is, deciding whether it's the right one, fetching it, proving it's good,
and handing it over. First with a person approving each grab, later on
its own within rules the person sets.

### Principles that hold throughout

1. **A companion, not a replacement.** The *Arrs stay the source of truth
   for what's wanted and what's in the library. Eziarr never keeps a second
   copy of that state for longer than a sync.
2. **One container, SQLite, no cloud.** Self-hosted on a home server with
   no external service of ours, no telemetry, no account.
3. **Your accounts, your sources.** Eziarr searches what the user already
   has access to (their indexers, their Telegram channels). It does not
   ship lists of sources.
4. **Automatic only when it can explain itself.** Anything Eziarr grabs on
   its own comes with the reason it chose that file, and can be undone.
5. **Fast with a big library.** 3000+ titles is the normal case, not an
   edge case (AGENTS rule 13).

---

## Phase 1: Trust (1.6 – 1.8, roughly Q4 2026 – Q2 2027)

Make what's already there dependable before adding automation on top.

**Real-instance testing**
- CI job that runs real Radarr, Sonarr, Lidarr and Prowlarr containers
  (pinned versions) and drives sync, deep search, force-grab and import
  end to end. The force-grab and import-scan rules (AGENTS 5, 7) were
  learnt on live instances; this pins them.
- A version matrix: the current and previous major of each *Arr.

**One source interface**
- Move Telegram, Internet Archive and open directories behind one
  contract in `backend/sources/`: `search(titleContext) → candidates` and
  `fetch(candidate) → stream`. Prowlarr stays special (the *Arr grabs
  those itself).
- `match.js` ranks candidates from every source the same way, so a score
  means the same thing everywhere.
- **Unified deep search:** one results list across all sources, each row
  tagged with where it came from, instead of a tab per source. The tabs
  stay for browsing a single source.

**Know what you downloaded**
- After download, probe the file (container, duration, resolution, audio
  and subtitle languages) before import. Flag a "1080p" that is 480p, a
  feature film that runs 4 minutes, or an archive that holds an `.exe`.
- Keep the probe result in `download_history` and show it in the queue.

**Downloads that survive trouble**
- Resumable HTTP downloads (Range) and Telegram downloads (offset), so
  a restart doesn't throw away 4 GB.
- Respect Telegram `FLOOD_WAIT` across the whole process: one shared
  limiter, not per request.
- Report partial results: "3 of 40 channels couldn't be searched".

**Notifications out**
- Webhook, ntfy and Apprise-style targets for "downloaded", "import
  failed" and "needs attention", alongside the in-app notifications.

*Done when:* the live-*Arr CI job is required on PRs, every non-indexer
source goes through `sources/`, and every import has a probe result.

## Phase 2: Autonomy (2.0 – 2.x, roughly H2 2027)

Let Eziarr act on its own, inside rules, with a person able to see why.

**Auto-hunt beyond the indexers**
- When the hunter has failed on an item N times (or for N days), Eziarr
  searches the other sources itself.
- **Rules** decide what happens to what it finds: minimum match score,
  allowed sources, size and quality bounds per *Arr quality profile, and
  language (the force-grab language work in 1.4 is the start of this).
- Three outcomes per candidate: **grab**, **ask** (it goes to an approval
  inbox) or **ignore**. Off by default; "ask" is the first setting most
  people should try.
- Every automatic grab records the rule and score that chose it, shown on
  the title and in history, with one-click undo (remove from the *Arr and
  delete the file).

**Upgrades, not only missing**
- Titles below their quality profile's cutoff (the *Arrs' "cutoff unmet"
  list) get the same deep search, so a cam copy found in Phase 1 can be
  replaced by a real release later.

**API v2**
- A versioned, documented public API (`/api/v2`) built from the TypeBox
  models, with the OpenAPI document published per release. v1 stays,
  frozen, for at least a year after v2 ships.

*Done when:* someone can leave auto-hunt on "grab" for a month and every
grab is either right or undone with one click, with a reason recorded.

## Phase 3: The household (3.x, roughly 2028)

Eziarr today has one admin. Libraries are shared.

- **Users and roles:** admin, member (search, request, approve their own),
  viewer. Per-user notification targets.
- **Requests:** read pending requests from Jellyseerr/Overseerr so "what's
  missing" includes "what someone asked for", and say who is waiting.
- **Priority:** with a Plex/Jellyfin/Emby connection, know what is being
  watched, so the next episode of a show someone is halfway through gets
  searched before a film nobody has opened the page for.
- **Several instances of one *Arr** (a 4K Radarr and a 1080p Radarr) shown
  as one title with two states.

*Done when:* a household of four uses one Eziarr without sharing a
password, and the wall is ordered by what people are waiting for.

## Phase 4: An ecosystem (2029 onwards)

Only if Phases 1–3 landed and people are building on the API.

- **Third-party sources** through the `sources/` contract, loaded as
  plugins with declared permissions (network hosts, disk), sandboxed and
  disabled by default. The SSRF guard and the download caps apply to them
  too.
- **Library health beyond missing:** duplicates across instances, files
  whose audio isn't the title's original language, episodes with no
  subtitles (hand-off to Bazarr), and broken files that won't probe.
- **Collections:** "you have 4 of the 5 films in this collection"
  (from TMDb collections via Radarr), searched as a set.

---

## Things we are deliberately not doing

- Being an indexer, a tracker or a download client. Eziarr hands torrents
  and NZBs to the *Arr's client and only downloads directly from sources
  the *Arrs can't reach.
- A hosted or cloud version, or shipped lists of channels and sites.
- Replacing the *Arrs' UIs for adding titles, profiles or calendars.
- Moving off SQLite, unless Phase 3 shows that one writer is a real
  limit.

## Risks

| Risk | What we'd do |
| --- | --- |
| Telegram restricts or bans accounts doing automated search | Auto-hunt treats Telegram as "ask" by default; shared rate limiter; per-day search budget. |
| A *Arr major version changes its API (Sonarr v5, Radarr 7) | The version matrix in CI catches it; `arr()` stays the only place that knows versions. |
| Bun or Elysia churn (it has already bitten us: 1.4.0 crash-loop, `bufferutil`) | Pin Bun in Docker, smoke-test built images, keep AGENTS rules 10–11. |
| Auto-grab picks wrong files and erodes trust | Probes before import, recorded reasons, undo, "ask" before "grab". |
| One maintainer | Small releases, the test suite as the spec, AGENTS.md kept current so agents and contributors can carry work. |

## Near-term backlog (feeds 1.6)

- Partial-search notice for Telegram (skipped channels).
- Replace the 5 s `mutate()` timer after a Telegram grab with the live
  stream.
- Clear the four `biome-ignore … useExhaustiveDependencies: later`.
- Retake `assets/telegram.png` without the channel picker.
- Decide on `motion` 14 and `concurrently` 10 once they've settled.
