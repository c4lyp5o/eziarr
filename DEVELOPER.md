# Eziarr Developer Documentation

Eziarr is structured as a decoupled Single Page Application (SPA) interacting with a high-performance, asynchronous REST API. 

## 🏗️ Architecture & Tech Stack

Eziarr runs as a microservice architecture using PM2 to manage two distinct Node.js processes: the **API Server** and the **Background Worker**. Because they run in separate memory spaces, they use SQLite in WAL (Write-Ahead Logging) mode as an ultra-fast Inter-Process Communication (IPC) bridge.

### Backend
* **Framework:** ElysiaJS (A fast Bun-native web framework).
* **Database:** `bun:sqlite` with `PRAGMA journal_mode = WAL;` enabled to allow highly concurrent read/writes between the Server and Worker.
* **Process Manager:** PM2 (runs `index.js` and `worker.js` concurrently).
* **MTProto Client:** GramJS is used to handle native Telegram API interactions, bypassing the standard Telegram Bot API file-size limits.
* **HTTP Client:** Axios for interacting with the *Arr stack APIs and streaming HTTP downloads.

### Frontend
* **Framework:** React.
* **Styling:** Tailwind CSS.
* **Icons:** Lucide-React.
* **Data Fetching:** SWR for aggressive, stale-while-revalidate data syncing and live UI polling (e.g., Active Tasks and Logs).

## 📂 Backend File Structure

* `index.js`: The main Elysia API router. Exposes endpoints for the frontend. It no longer blocks for downloads; instead, it pushes download requests to the database queue and returns instantly.
* `worker.js`: The core background processor. It runs a continuous loop to process the `download_queue`, sync missing items from *Arr apps, run the Prowlarr "Hunter", and execute a 24-hour file sweeper to clean up zombie downloads.
* `db.js`: SQLite interface. Handles the schema, settings, and the crucial `active_tasks` and `download_queue` tables for IPC.
* `telegram.js`: Manages Telegram authentication and media downloading via GramJS. Includes progress callbacks for real-time UI updates.
* `ia.js`: Integrates with the Internet Archive. Includes defensive optional chaining to handle upstream API instability.
* `opendir.js`: A scraping utility that uses Regex to parse Apache/Nginx open directories for video file extensions.
* `downloader.js`: A generic Axios stream downloader used for pulling files from HTTP sources to the local disk safely, including SSRF protections.
* `utils.js`: Houses the `SERVICES` configuration, the `translatePath` cross-OS path mapper, and the `getPosterUrl` function (which prioritizes TMDB/TVDB public URLs to prevent API key exposure and CORS/302 issues).

## 🗄️ Database Schema

**Table: `missing_items`** (Caches *Arr missing lists)
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | TEXT | Primary Key (e.g., `radarr-123`) |
| `service_id` | INTEGER | The ID relative to the *Arr service |
| `title` | TEXT | Movie, Episode, or Album title |

**Table: `active_tasks`** (IPC for Live UI Updates)
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | TEXT | Primary Key |
| `type` | TEXT | E.g., `Download`, `Sync`, `Hunter` |
| `message` | TEXT | Status description (e.g., `Downloading: Movie.mkv (45%)`) |
| `progress` | INTEGER | 0-100 percentage for UI progress bars |

**Table: `download_queue`** (Worker Queue)
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | TEXT | Primary Key |
| `type` | TEXT | `telegram` or `http` |
| `payload` | TEXT | JSON stringified metadata required for the download |
| `status` | TEXT | `pending`, `downloading`, or `failed` |

**Table: `settings`** (User Config & Telegram Sessions)
| Column | Type | Description |
| :--- | :--- | :--- |
| `key` | TEXT | Setting identifier (e.g., `syncInterval`) |
| `value` | TEXT | JSON stringified value of the setting |

## 🔌 Core API Routes

All endpoints are prefixed with `/api/v1`.

### System & Tasks
* `GET /system/tasks`: Returns active background tasks running on the Worker (polled by SWR).
* `GET /system/logs`: Returns the tail of the PM2 output logs for the UI terminal.

### Media & Sync
* `GET /missing`: Returns a combined payload of `missing` items (from local DB) and `queue` items (fetched live from *Arr APIs).
* `POST /unmonitor`: Commands the target *Arr service to stop monitoring an item and purges it from the local DB.
* `POST /forcegrab`: Pushes a specific release directly to the *Arr client, automatically switching profiles or deleting queue blockers if rejected.

### Deep Search & Alternative Sources
* `POST /telegram/import` & `POST /import/http`: Fetches the exact requested Title/Year from the *Arr API, renames the file perfectly, and inserts a job into the `download_queue` for the Worker to handle asynchronously.

## 🛠️ Development Notes

1. **State Management:** The Telegram session is stored as a `StringSession` in the `settings` table. If you need to force a re-login, delete the `telegramSession` row. 
2. **Database Thrashing:** Because `worker.js` constantly polls the queue and updates progress bars, it relies heavily on WAL mode. Do not remove `PRAGMA journal_mode = WAL;` or the API will suffer from `SQLITE_BUSY` locks.
3. **SMB Race Conditions:** When downloading massive files over mounted Windows SMB shares, network latency can cause *Arr imports to fail. The worker intentionally introduces a delay (via `setTimeout`) after downloading to allow the OS cache to flush before triggering the import.