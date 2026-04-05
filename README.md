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

* **First-Time Setup:** Forces the creation of an admin account on the first boot.
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
3. Open the web UI. Eziarr will prompt you to secure your installation and then automatically sync your missing items!