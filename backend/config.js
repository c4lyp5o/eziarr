import path from "node:path";
import { dataDir, keepLegacy } from "./datadir";

export const DEFAULT_SETTINGS = {
	password: "",
	syncEnabled: true, // Enable or disable the worker sync
	hunterEnabled: true, // Enable or disable the Prowlarr hunter
	syncInterval: 10, // Minutes between *Arr missing syncs
	hunterInterval: 15, // Minutes between automated Prowlarr searches
	radarrUrl: "",
	radarrApiKey: "",
	sonarrUrl: "",
	sonarrApiKey: "",
	lidarrUrl: "",
	lidarrApiKey: "",
	prowlarrUrl: "",
	prowlarrApiKey: "",
	telegramApiId: "", // Your my.telegram.org App ID
	telegramApiHash: "", // Your my.telegram.org App Hash
	pathMapRemote: "", // e.g., C:\Imports
};

// Each data directory can be moved with an env var; the test preload uses
// these so tests never touch the real database, logs or downloads.
export const DOWNLOAD_DIR =
	process.env.EZIARR_DOWNLOAD_DIR || path.join(import.meta.dir, "../downloads");
// All state lives under DATA_DIR (ez standard). A database at the pre-1.7
// location (db/eziarr.sqlite) keeps being used until it is moved.
const ROOT = path.join(import.meta.dir, "..");
export const DATA_DIR = dataDir(ROOT);
export const DB_PATH = process.env.EZIARR_DB_DIR
	? path.join(process.env.EZIARR_DB_DIR, "eziarr.sqlite")
	: keepLegacy(path.join(DATA_DIR, "eziarr.sqlite"), [path.join(ROOT, "db/eziarr.sqlite")]);
export const DB_DIR = path.dirname(DB_PATH);
export const LOG_DIR = process.env.EZIARR_LOG_DIR || path.join(DATA_DIR, "logs");
export const CLIENT_DIR = path.join(import.meta.dir, "../client");

// Largest single download (HTTP or Telegram) we will write to disk: 5 GiB.
export const MAX_DOWNLOAD_BYTES = 5 * 1024 * 1024 * 1024;
