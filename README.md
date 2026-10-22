# Eziarr - *Arr Missing Media Manager

Eziarr is a powerful, production-ready missing-media manager designed to work alongside your existing *Arr stack (Radarr, Sonarr, Lidarr). When standard indexers fail to find your missing movies, shows, or albums, Eziarr steps in to give you manual and automated tools to hunt them down across alternative sources like Telegram, the Internet Archive, and Open Directories.

## ✨ Key Features

* **Unified Dashboard:** View all your missing media from Radarr, Sonarr, and Lidarr in one clean, filterable interface.
* **Periodical Searches:** A background worker continuously monitors your missing items and periodically triggers automated searches on your indexers to find missing items.
* **Asynchronous IPC Queue:** Downloads are handled by a dedicated background worker communicating via a high-performance SQLite WAL queue, keeping the UI fast and preventing memory crashes.
* **Deep Search Capabilities:** * **Telegram (MTProto):** Connect your Telegram account to search channels and download large media files directly bypassing bot limits.
  * **Internet Archive:** Search and download public domain or archived media directly from archive.org.
  * **Open Directories:** Paste an Apache/Nginx directory link, and Eziarr will scan it for video files.
* **Force Grab:** Instantly bypass *Arr quality profiles or stalled queues to force a release to download.
* **Auto-Import:** Eziarr downloads alternative media locally and automatically commands Radarr/Sonarr to import and move the files.

## 🔐 Security & Authentication

* **First-Time Setup:** On first boot Eziarr prints a one-time **setup code** to its console (`docker logs eziarr`). Setting the password needs that code, so nobody who merely reaches the server can claim it first. The code works once and changes on every restart until setup is done. To skip it, set `EZIARR_PASSWORD` (or `EZIARR_PASSWORD_FILE`, at least 8 characters) before the first start.
* **Session Revocation:** Changing the password signs out every other browser and device; the one you changed it from stays signed in.
* **Login Rate Limiting:** 10 attempts per minute per client. Behind a reverse proxy, set `TRUST_PROXY` to the number of proxies in front of Eziarr (usually `1`) so each client is limited by its real address. Leave it unset otherwise: `X-Forwarded-For` is then ignored, because any client can send it.
* **HttpOnly JWT Cookies:** Sessions are secured using HttpOnly cookies with silent automated refresh cycles, rendering them immune to XSS attacks.
* **SSRF Protection:** Built-in DNS and IP validation prevents Server-Side Request Forgery attacks when downloading from alternative web sources.
* **Local Network Safe:** Authentication cookies are designed to work smoothly over local `http://` network IPs. *(Note: If you expose Eziarr to the public internet, it is highly recommended to place it behind an HTTPS reverse proxy).*

## ⚙️ Configuration & Path Mapping

Eziarr features a built-in Settings UI to manage your setup, view active background tasks, and monitor system logs in real-time.

### The "Docker vs. Host" Problem (Path Translation)
If you run Eziarr in a Docker container, but Radarr/Sonarr are on your host machine (or another NAS), they won't agree on where downloaded files live. 

1. Eziarr downloads a movie to `/app/downloads/movie.mkv`.
2. Eziarr tells Radarr to import `/app/downloads/movie.mkv`.
3. Radarr looks at its own hard drive, can't find it, and fails.

**The Fix:**
In the Eziarr Settings UI, configure the **Path Translation**:
* **Eziarr Local Path (Docker Prefix):** `/app/downloads`
* **Arr Remote Path (Host Prefix):** `C:\Imports` (or whatever your shared network folder is mapped to).

Eziarr will seamlessly translate the paths before asking Radarr to import them.

## 🚀 Getting Started
1. Configure your `.env` or use the built-in Settings UI.
2. Start the backend server and worker using Docker Compose or PM2.
3. Open the web UI and enter the setup code from the server log, then choose a password. Eziarr then syncs your missing items automatically.

### Environment variables

| Variable | Default | What it does |
| --- | --- | --- |
| `EZIARR_PASSWORD` / `EZIARR_PASSWORD_FILE` | unset | Sets the password on first boot and skips the setup code. Ignored once a password exists. |
| `TRUST_PROXY` | `0` | Number of reverse proxies whose `X-Forwarded-For` entries are trusted for rate limiting. |
| `COOKIE_SECURE` | auto | Force `true`/`false` for the `Secure` cookie flag. |
| `JWT_SECRET` | generated | Signing key for sessions; generated and stored on first boot when unset. |

Single downloads (HTTP or Telegram) are capped at 5 GiB.