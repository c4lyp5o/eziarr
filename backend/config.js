import path from "node:path";

export const SERVICES = {
	sonarr: {
		url: process.env.SONARR_URL || "http://localhost:8989",
		apiKey: process.env.SONARR_API_KEY || "",
	},
	radarr: {
		url: process.env.RADARR_URL || "http://localhost:7878",
		apiKey: process.env.RADARR_API_KEY || "",
	},
	lidarr: {
		url: process.env.LIDARR_URL || "http://localhost:8686",
		apiKey: process.env.LIDARR_API_KEY || "",
	},
	prowlarr: {
		url: process.env.PROWLARR_URL || "http://localhost:9696",
		apiKey: process.env.PROWLARR_API_KEY || "",
	},
};

export const DEFAULT_SETTINGS = {
	syncEnabled: true, // Enable or disable the worker sync
	hunterEnabled: true, // Enable or disable the Prowlarr hunter
	syncInterval: 10, // Minutes between *Arr missing syncs
	hunterInterval: 15, // Minutes between automated Prowlarr searches
	telegramApiId: "", // Your my.telegram.org App ID
	telegramApiHash: "", // Your my.telegram.org App Hash
	pathMapDocker: "", // e.g., /app/downloads
	pathMapRemote: "", // e.g., C:\Imports
};

export const DOWNLOAD_DIR = path.resolve(process.cwd(), "downloads");
