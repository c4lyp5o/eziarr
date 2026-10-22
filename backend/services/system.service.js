import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import { getAllSettings, getTasks } from "../db";
import { LOG_DIR } from "../config";
import { generalLogger as logger } from "../logger";
import { tailLogs } from "../logtail";

let latestVersionCache = null;
let lastVersionCheck = 0;

const getLatestVersion = async () => {
	const now = Date.now();
	if (latestVersionCache && now - lastVersionCheck < 21600000) {
		return latestVersionCache;
	}

	try {
		const res = await axios.get(
			"https://api.github.com/repos/c4lyp5o/eziarr/releases/latest",
			{ timeout: 5000 },
		);
		latestVersionCache = res.data.tag_name.replace(/^v/, "");
		lastVersionCheck = now;
		return latestVersionCache;
	} catch (_err) {
		logger.warn("[SERVER] Failed to check for updates from GitHub.");
		return null;
	}
};

const isUpdateAvailable = (current, latest) => {
	if (!latest || !current) return false;
	const c = current.split(".").map(Number);
	const l = latest.split(".").map(Number);
	for (let i = 0; i < 3; i++) {
		if ((l[i] || 0) > (c[i] || 0)) return true;
		if ((l[i] || 0) < (c[i] || 0)) return false;
	}
	return false;
};

export const SystemService = {
	getSystem: async () => {
		const s = getAllSettings();
		const hasRadarr = !!(s.radarrUrl && s.radarrApiKey);
		const hasSonarr = !!(s.sonarrUrl && s.sonarrApiKey);
		const hasLidarr = !!(s.lidarrUrl && s.lidarrApiKey);

		let currentVersion = "";
		try {
			const pkgPath = path.join(import.meta.dir, "../../package.json");
			const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
			currentVersion = pkg.version;
		} catch (_err) {
			// ignore
		}

		const latestVersion = await getLatestVersion();
		const updateAvailable = isUpdateAvailable(currentVersion, latestVersion);

		return {
			success: true,
			isSetup: hasRadarr || hasSonarr || hasLidarr,
			currentVersion,
			latestVersion,
			updateAvailable,
			features: {
				radarr: hasRadarr,
				sonarr: hasSonarr,
				lidarr: hasLidarr,
				prowlarr: !!(s.prowlarrUrl && s.prowlarrApiKey),
				telegram: !!(s.telegramApiId && s.telegramApiHash),
			},
		};
	},

	postSystemTest: async ({ body: { service, url, apiKey }, status }) => {
		if (!["radarr", "sonarr", "lidarr", "prowlarr"].includes(service)) {
			return status(400, {
				success: false,
				message: "Invalid service",
			});
		}

		// The *Arr URLs are the admin's own servers, usually on the LAN, so the
		// SSRF guard (which refuses private addresses) doesn't apply here: it
		// made "Test" fail for every LAN install. Only plain http(s) is allowed.
		let parsed;
		try {
			parsed = new URL(url);
		} catch {
			parsed = null;
		}
		if (!parsed || !["http:", "https:"].includes(parsed.protocol)) {
			return status(400, {
				success: false,
				message: "Enter an http:// or https:// URL.",
			});
		}

		const cleanUrl = url.replace(/\/$/, "");

		const apiVer = service === "lidarr" || service === "prowlarr" ? "v1" : "v3";

		await axios.get(`${cleanUrl}/api/${apiVer}/system/status`, {
			headers: { "X-Api-Key": apiKey },
			timeout: 5000,
		});
		return { success: true, message: "Test successful" };
	},

	getSystemTasks: () => {
		const tasks = getTasks();
		return { success: true, tasks };
	},

	getSystemLogs: ({ query: { type } }) => {
		// General = the server's log and the worker's, merged by time.
		const files =
			type === "hunter"
				? ["hunter.log"]
				: ["general.log", "worker.log"];

		try {
			const logs = tailLogs(files.map((f) => path.join(LOG_DIR, f)));
			return { success: true, logs };
		} catch (_err) {
			return { success: false, message: "Could not read logs", logs: [] };
		}
	},
};
