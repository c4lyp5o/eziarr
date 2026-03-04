import path from "node:path";

export const DEFAULT_SETTINGS = {
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
	pathMapDocker: "", // e.g., /app/downloads
	pathMapRemote: "", // e.g., C:\Imports
};

export const DOWNLOAD_DIR = path.join(import.meta.dir, "../downloads");
export const DB_DIR = path.join(import.meta.dir, "../db");
export const LOG_DIR = path.join(import.meta.dir, "../logs");
export const CLIENT_DIR = path.join(import.meta.dir, "../client");
