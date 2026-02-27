# Eziarr Developer Documentation

Eziarr is structured as a decoupled Single Page Application (SPA) interacting with a lightweight, high-performance REST API. 

## 🏗️ Architecture & Tech Stack

### Backend
* **Framework:** ElysiaJS (A fast Bun-native web framework).
* **Database:** `bun:sqlite` (SQLite). State is intentionally ephemeral but persistent enough to handle app restarts and queue states.
* **MTProto Client:** GramJS is used to handle native Telegram API interactions, bypassing the standard Telegram Bot API file-size limits.
* **HTTP Client:** Axios for interacting with the *Arr stack APIs and streaming HTTP downloads.

### Frontend
* **Framework:** React.
* **Styling:** Tailwind CSS.
* **Icons:** Lucide-React.
* **Data Fetching:** SWR for aggressive, stale-while-revalidate data syncing.

## 📂 Backend File Structure

* `index.js`: The main Elysia API router. Exposes endpoints for the frontend and handles the core orchestration of downloads and *Arr API commands.
* `worker.js`: A standalone background process. It runs on configured intervals to sync missing items from the *Arr apps and trigger the "Hunter" (automated Prowlarr searches). Includes a 24-hour file sweeper to clean up zombie downloads.
* `db.js`: SQLite interface. Uses two primary tables: `missing_items` (caches the *Arr missing lists) and `settings` (stores user preferences and Telegram session strings as JSON).
* `telegram.js`: Manages Telegram authentication (Phone -> Code -> 2FA Password) and file downloading via GramJS.
* `ia.js`: Integrates with the `archive.org/advancedsearch.php` endpoint to query and resolve direct `.mp4`/`.mkv` links.
* `opendir.js`: A scraping utility that uses Regex to parse Apache/Nginx open directories for video file extensions.
* `downloader.js`: A generic Axios stream downloader used for pulling files from HTTP sources (IA, OpenDirs) to the local disk safely.
* `utils.js`: Houses the `SERVICES` configuration, Queue fetchers, and the crucial `translatePath` function for cross-container file mapping.

## 🗄️ Database Schema

Eziarr relies on an extremely flat SQLite structure:

**Table: `missing_items`**
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | TEXT | Primary Key (e.g., `radarr-123`) |
| `service_id` | INTEGER | The ID relative to the *Arr service |
| `title` | TEXT | Movie, Episode, or Album title |
| `type` | TEXT | `movie`, `episode`, or `album` |
| `status` | TEXT | Current queue or missing status |

**Table: `settings`**
| Column | Type | Description |
| :--- | :--- | :--- |
| `key` | TEXT | Setting identifier (e.g., `syncInterval`) |
| `value` | TEXT | JSON stringified value of the setting |

## 🔌 Core API Routes

All endpoints are prefixed with `/api/v1`.

### Media & Sync
* `GET /missing`: Returns a combined payload of `missing` items (from local DB) and `queue` items (fetched live from *Arr APIs).
* `POST /unmonitor`: Commands the target *Arr service to stop monitoring an item and purges it from the local DB.
* `POST /search`: Triggers a standard automated search in the target *Arr service.
* `POST /forcegrab`: Pushes a specific torrent/NZB release directly to the *Arr client, bypassing queue/quality blocks by dynamically switching profiles if rejected.

### Deep Search & Alternative Sources
* `POST /deepsearch`: Queries Prowlarr directly to return raw indexer results for manual grabbing.
* `POST /telegram/search`: Searches a connected Telegram channel for media.
* `POST /telegram/import`: Downloads a file from Telegram and sends a `DownloadedMoviesScan` (or Episode equivalent) command to Radarr/Sonarr.
* `POST /ia/search` & `GET /ia/files/:id`: Queries the Internet Archive.
* `POST /opendir/scan`: Parses an open directory URL for media.

## 🛠️ Development Notes

1. **Path Normalization:** If running on Windows, the `translatePath` function actively corrects forward slashes `/` to backward slashes `\` to prevent Radarr API rejections.
2. **State Management:** The Telegram session is stored as a `StringSession` in the `settings` table. If you need to force a re-login, delete the `telegram_session` row from the DB.