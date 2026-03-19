# Eziarr Developer Documentation

Eziarr is structured as a decoupled Single Page Application (SPA) interacting with a high-performance, asynchronous REST API. 

## 🏗️ Architecture & Tech Stack

Eziarr runs as a microservice architecture using PM2 to manage two distinct Node.js processes: the **API Server** and the **Background Worker**. Because they run in separate memory spaces, they use SQLite in WAL (Write-Ahead Logging) mode as an ultra-fast Inter-Process Communication (IPC) bridge.

### Backend
* **Framework:** ElysiaJS (A fast Bun-native web framework with TypeBox validation).
* **Database:** `bun:sqlite` with `PRAGMA journal_mode = WAL;` enabled to allow highly concurrent read/writes between the Server and Worker.
* **Process Manager:** PM2 (runs `index.js` and `worker.js` concurrently).
* **MTProto Client:** GramJS is used to handle native Telegram API interactions, bypassing the standard Telegram Bot API file-size limits.
* **HTTP Client:** Axios for interacting with the *Arr stack APIs and streaming HTTP downloads.
* **Testing:** Vitest for comprehensive API, Authentication, and Queue lifecycle testing.

### Frontend
* **Framework:** React 19.
* **Build Tool:** Vite.
* **Styling:** Tailwind CSS v4 & Lucide-React icons.
* **Data Fetching:** SWR for aggressive, stale-while-revalidate data syncing and live UI polling (e.g., Active Tasks and Logs). Custom wrapper (`apiCall.js`) handles silent HTTP-Only JWT token refreshes automatically.

## 📂 Backend File Structure (MVC-style)

Eziarr's backend is modularized to ensure clean separation of concerns:

* **`index.js`**: The main application entry point. Mounts the Elysia application, registers plugins, and sets up static file serving for the frontend.
* **`worker.js`**: The core background processor. It runs a continuous loop to process the `download_queue`, sync missing items from *Arr apps, run the Prowlarr "Hunter", and execute a 24-hour file sweeper.
* **`/routes`**: Contains Elysia route definitions (e.g., `auth.route.js`, `missing.route.js`). Maps HTTP endpoints to service functions and attaches TypeBox validation schemas.
* **`/services`**: Contains the core business logic (e.g., `auth.service.js`, `missing.service.js`). Processes requests and interacts with the database or external APIs.
* **`/models`**: TypeBox schemas used by routes to strictly validate incoming JSON bodies and outgoing responses.
* **`/plugins`**: Elysia middleware. Contains `auth.plugin.js` (decodes JWTs) and `protector.plugin.js` (guards private routes with a 401 Unauthorized wall).
* **`/tests`**: Comprehensive Vitest suites covering external service mocks, the SQLite state machine, and authentication flows.
* **`db.js`**: SQLite interface. Handles the schema, settings, and the crucial `active_tasks` and `download_queue` tables for IPC.
* **`telegram.js`**: Manages Telegram authentication and media downloading via GramJS.
* **`utils.js`**: Security and utility helpers. Includes the `isSafeUrl` SSRF protection filter and `translatePath` cross-OS path mapper.

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

**Table: `download_queue`** (Worker Queue State Machine)
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | TEXT | Primary Key |
| `status` | TEXT | `pending`, `downloading`, `retry`, or `failed` |
| `attempts` | INTEGER| Exponential backoff tracker |

## 🔌 Core API Routes

* `GET /api/v1/system/tasks`: Returns active background tasks running on the Worker.
* `GET /api/v1/missing`: Returns a combined payload of local DB missing items and live *Arr queues.
* `POST /api/v1/missing/forcegrab`: Pushes a release directly to the *Arr client, temporarily bypassing quality profiles if rejected.
* `POST /api/v1/telegram/import`: Fetches exact metadata, renames the file perfectly, and inserts a job into the SQLite `download_queue`.

## 🛠️ Development Notes

1. **State Management:** The Telegram session is stored as a `StringSession` in the `settings` table.
2. **Database Thrashing:** Because `worker.js` constantly polls the queue and updates progress bars, it relies heavily on WAL mode. Do not remove `PRAGMA journal_mode = WAL;`.
3. **Authentication:** The frontend relies on HttpOnly cookies (`eziarr_access`, `eziarr_refresh`). Local development requires `same-origin` fetch configurations.