import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import {
	upsertItem,
	getNextItemToSearch,
	markAsSearched,
	deleteItem,
	getAllIds,
	getAllSettings,
} from "./db";
import { SERVICES, getPosterUrl } from "./utils";

const syncMissingItems = async () => {
	console.log("🔄 Worker: Syncing missing items...");

	const activeIds = new Set();

	try {
		// 1. RADARR
		try {
			const radarrRes = await axios.get(
				`${SERVICES.radarr.url}/api/v3/wanted/missing`,
				{
					params: { pageSize: 100, sortKey: "releaseDate", sortDir: "desc" },
					headers: { "X-Api-Key": SERVICES.radarr.apiKey },
				},
			);
			radarrRes.data.records.forEach((m) => {
				const id = `radarr-${m.id}`;
				activeIds.add(id);
				upsertItem({
					id: id,
					serviceId: m.id,
					title: m.title,
					type: "movie",
					service: "radarr",
					releaseDate: m.inCinemas || m.digitalRelease,
					status: m.status,
					posterUrl: getPosterUrl(m.images, "radarr", "poster"),
				});
			});
		} catch (err) {
			console.error("Radarr Sync Error", err);
		}

		// 2. SONARR
		try {
			const sonarrRes = await axios.get(
				`${SERVICES.sonarr.url}/api/v3/wanted/missing`,
				{
					params: {
						pageSize: 100,
						sortKey: "airDateUtc",
						sortDir: "desc",
						includeSeries: true,
					},
					headers: { "X-Api-Key": SERVICES.sonarr.apiKey },
				},
			);
			sonarrRes.data.records.forEach((ep) => {
				const id = `sonarr-${ep.id}`;
				activeIds.add(id);
				upsertItem({
					id: id,
					serviceId: ep.id,
					title: `${ep.series?.title || ""} - S${ep.seasonNumber}E${ep.episodeNumber}`,
					seriesTitle: ep.series?.title,
					type: "episode",
					service: "sonarr",
					releaseDate: ep.airDateUtc,
					status: "missing",
					posterUrl: getPosterUrl(ep.series?.images, "sonarr", "poster"),
				});
			});
		} catch (err) {
			console.error("Sonarr Sync Error", err);
		}

		// 3. LIDARR
		try {
			const lidarrRes = await axios.get(
				`${SERVICES.lidarr.url}/api/v1/wanted/missing`,
				{
					params: {
						page: 1,
						pageSize: 100,
						sortKey: "releaseDate",
						sortDir: "desc",
					},
					headers: { "X-Api-Key": SERVICES.lidarr.apiKey },
				},
			);
			lidarrRes.data.records.forEach((album) => {
				const id = `lidarr-${album.id}`;
				activeIds.add(id);
				upsertItem({
					id: id,
					serviceId: album.id,
					title: `${album.artist.artistName} - ${album.title}`,
					type: "album",
					service: "lidarr",
					releaseDate: album.releaseDate,
					status: "missing",
					posterUrl: getPosterUrl(album.images, "lidarr", "cover"),
				});
			});
		} catch (err) {
			console.error("Lidarr Sync Error", err);
		}

		// 4. CLEANUP (Soft Sync)
		const allDbIds = getAllIds();
		const idsToDelete = allDbIds.filter((id) => !activeIds.has(id));

		if (idsToDelete.length > 0) {
			console.log(
				`🧹 Cleaning up ${idsToDelete.length} downloaded/removed items...`,
			);
			idsToDelete.forEach((id) => {
				deleteItem(id);
			});
		}

		console.log("✅ Worker: Sync Complete");
	} catch (err) {
		console.error("Worker Sync Failed:", err);
	}
};

const runHunter = async () => {
	const item = getNextItemToSearch();
	if (!item) {
		console.log("💤 Hunter: No eligible old items to search.");
		return;
	}

	console.log(
		`🎯 Hunter: Triggering search for [${item.service}] ${item.title}`,
	);

	const serviceConfig = SERVICES[item.service];

	let endpoint = "/api/v3/command";
	let payload = {};

	if (item.service === "radarr") {
		payload = { name: "MoviesSearch", movieIds: [item.service_id] };
	} else if (item.service === "sonarr") {
		payload = { name: "EpisodeSearch", episodeIds: [item.service_id] };
	} else if (item.service === "lidarr") {
		endpoint = "/api/v1/command";
		payload = { name: "AlbumSearch", albumIds: [item.service_id] };
	}

	try {
		await axios.post(`${serviceConfig.url}${endpoint}`, payload, {
			headers: { "X-Api-Key": serviceConfig.apiKey },
		});
		markAsSearched(item.id);
		console.log(`✅ Hunter: Search started for ${item.title}`);
	} catch (err) {
		console.error(`❌ Hunter: Failed to search ${item.title}`, err);
	}
};

let syncIntervalId = null;
let hunterIntervalId = null;

let currentConfig = null;

const applySettings = async (settings) => {
	const newConfig = {
		syncEnabled: settings.syncEnabled ?? true,
		hunterEnabled: settings.hunterEnabled ?? true,
		syncInterval: parseInt(settings.syncInterval, 10) || 10,
		hunterInterval: parseInt(settings.hunterInterval, 10) || 1,
	};

	if (JSON.stringify(newConfig) === JSON.stringify(currentConfig)) {
		return;
	}

	console.log("🔄 Settings changed. Reconfiguring worker...");

	if (syncIntervalId) {
		clearInterval(syncIntervalId);
		syncIntervalId = null;
	}

	if (hunterIntervalId) {
		clearInterval(hunterIntervalId);
		hunterIntervalId = null;
	}

	if (newConfig.syncEnabled) {
		console.log(`⏰ Sync every ${newConfig.syncInterval}m`);
		await syncMissingItems();
		syncIntervalId = setInterval(
			syncMissingItems,
			newConfig.syncInterval * 60000,
		);
	} else {
		console.log("⏸️ Worker: Sync is disabled in settings.");
	}

	if (newConfig.hunterEnabled) {
		console.log(`⏰ Hunter every ${newConfig.hunterInterval}m`);
		await runHunter();
		hunterIntervalId = setInterval(runHunter, newConfig.hunterInterval * 60000);
	} else {
		console.log("⏸️ Worker: Hunter is disabled in settings.");
	}

	currentConfig = newConfig;
};

const settingsWatcher = async () => {
	try {
		const settings = await getAllSettings();
		await applySettings(settings);
	} catch (err) {
		console.error("⚠️ Failed to load settings:", err);
	}
};

const cleanupOldDownloads = () => {
	const DOWNLOAD_DIR = path.resolve(process.cwd(), "downloads");
	if (!fs.existsSync(DOWNLOAD_DIR)) return;

	const MAX_AGE_MS = 24 * 60 * 60 * 1000;
	const now = Date.now();

	try {
		const folders = fs.readdirSync(DOWNLOAD_DIR);
		for (const folder of folders) {
			const folderPath = path.join(DOWNLOAD_DIR, folder);

			if (fs.statSync(folderPath).isDirectory()) {
				const files = fs.readdirSync(folderPath);

				// Check and delete old files
				for (const file of files) {
					const filePath = path.join(folderPath, file);
					const stats = fs.statSync(filePath);

					if (now - stats.mtimeMs > MAX_AGE_MS) {
						fs.unlinkSync(filePath);
						console.log(`🧹 Sweeper: Deleted old zombie file: ${filePath}`);
					}
				}

				if (fs.readdirSync(folderPath).length === 0) {
					fs.rmdirSync(folderPath);
				}
			}
		}
	} catch (err) {
		console.error("🧹 Sweeper Error:", err.message);
	}
};

const main = async () => {
	console.log("🚀 Worker booting...");
	await settingsWatcher();
	setInterval(settingsWatcher, 10000);
	console.log("✅ Worker started and settings watcher initialized.");
	cleanupOldDownloads();
	setInterval(cleanupOldDownloads, 60 * 60 * 1000);
	console.log("✅ Cleanup sweeper initialized.");
};

main().catch((err) => {
	console.error("Worker failed to start:", err);
	process.exit(1);
});
