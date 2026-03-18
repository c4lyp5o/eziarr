import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import { getAllSettings, getTasks } from "../db";
import { LOG_DIR } from "../config";

export const SystemService = {
	getSystem: () => {
		const s = getAllSettings();
		const hasRadarr = !!(s.radarrUrl && s.radarrApiKey);
		const hasSonarr = !!(s.sonarrUrl && s.sonarrApiKey);
		const hasLidarr = !!(s.lidarrUrl && s.lidarrApiKey);

		return {
			success: true,
			isSetup: hasRadarr || hasSonarr || hasLidarr,
			features: {
				radarr: hasRadarr,
				sonarr: hasSonarr,
				lidarr: hasLidarr,
				prowlarr: !!(s.prowlarrUrl && s.prowlarrApiKey),
				telegram: !!(s.telegramApiId && s.telegramApiHash),
			},
		};
	},

	postSystemTest: async ({ body: { service, url, apiKey } }) => {
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
		const filename = type === "hunter" ? "hunter.log" : "general.log";
		const logPath = path.join(LOG_DIR, filename);

		if (!fs.existsSync(logPath)) return { success: true, logs: [] };

		try {
			const content = fs.readFileSync(logPath, "utf-8");
			const lines = content.split("\n").filter(Boolean).slice(-100);
			return { success: true, logs: lines };
		} catch (_err) {
			return { success: false, message: "Could not read logs", logs: [] };
		}
	},
};
