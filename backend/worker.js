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
	getServicesConfig,
} from "./db";
import { generalLogger as logger, hunterLogger } from "./logger";
import { getPosterUrl } from "./utils";
import { DEFAULT_SETTINGS, DOWNLOAD_DIR } from "./config";

const syncMissingItems = async () => {
	const SERVICES = getServicesConfig();

	logger.info("[WORKER] 🔄 Syncing missing items...");

	const activeIds = new Set();

	try {
		// 1. RADARR
		if (SERVICES.radarr.url && SERVICES.radarr.apiKey) {
			try {
				const radarrRes = await axios.get(
					`${SERVICES.radarr.url}/api/v3/wanted/missing`,
					{
						params: { pageSize: 100, sortKey: "releaseDate", sortDir: "desc" },
						headers: { "X-Api-Key": SERVICES.radarr.apiKey },
						timeout: 30000,
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
				logger.error("[WORKER] Radarr Sync Error :", err);
			}
		} else {
			logger.warn("[WORKER[ Radarr not configured. Skipping sync.");
		}

		// 2. SONARR
		if (SERVICES.sonarr.url && SERVICES.sonarr.apiKey) {
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
						timeout: 30000,
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
				logger.error("[WORKER] Sonarr Sync Error :", err);
			}
		} else {
			logger.warn("[WORKER[ Sonarr not configured. Skipping sync.");
		}

		// 3. LIDARR
		if (SERVICES.lidarr.url && SERVICES.lidarr.apiKey) {
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
						timeout: 30000,
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
				logger.error("[WORKER] Lidarr Sync Error :", err);
			}
		} else {
			logger.warn("[WORKER[ Lidarr not configured. Skipping sync.");
		}

		// 4. CLEANUP (Soft Sync)
		const allDbIds = getAllIds();
		const idsToDelete = allDbIds.filter((id) => !activeIds.has(id));

		if (idsToDelete.length > 0) {
			logger.info(
				`[WORKER] 🧹 Cleaning up ${idsToDelete.length} downloaded/removed items...`,
			);
			idsToDelete.forEach((id) => {
				deleteItem(id);
			});
		}

		logger.info("[WORKER] ✅ Worker: Sync Complete");
	} catch (err) {
		logger.error("[WORKER] Worker Sync Failed: :", err);
	}
};

const runHunter = async () => {
	const SERVICES = getServicesConfig();

	const item = getNextItemToSearch();
	if (!item) {
		hunterLogger.info("[WORKER] 💤 Hunter: No eligible old items to search.");
		return;
	}

	hunterLogger.info(
		`[WORKER] 🎯 Hunter: Triggering search for [${item.service}] ${item.title}`,
	);

	const serviceConfig = SERVICES[item.service];

	if (!serviceConfig.url || !serviceConfig.apiKey) {
		hunterLogger.warn(`Service is not configured. Aborting hunt.`);
		return;
	}

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
			timeout: 30000,
		});
		markAsSearched(item.id);
		hunterLogger.info(`[WORKER] ✅ Hunter: Search started for ${item.title}`);
	} catch (err) {
		hunterLogger.error(
			`[WORKER] ❌ Hunter: Failed to search ${item.title}: `,
			err,
		);
	}
};

let syncIntervalId = null;
let hunterIntervalId = null;

let currentConfig = null;

const applySettings = async (settings) => {
	const syncInterval = Number.parseInt(settings.syncInterval, 10);
	const hunterInterval = Number.parseInt(settings.hunterInterval, 10);
	const radarrUrl = settings.radarrUrl;
	const radarrApiKey = settings.radarrApiKey;
	const sonarrUrl = settings.sonarrUrl;
	const sonarrApiKey = settings.sonarrApiKey;
	const lidarrUrl = settings.lidarrUrl;
	const lidarrApiKey = settings.lidarrApiKey;

	const newConfig = {
		syncEnabled: settings.syncEnabled ?? DEFAULT_SETTINGS.syncEnabled,
		hunterEnabled: settings.hunterEnabled ?? DEFAULT_SETTINGS.hunterEnabled,
		syncInterval: Number.isFinite(syncInterval)
			? syncInterval
			: DEFAULT_SETTINGS.syncInterval,
		hunterInterval: Number.isFinite(hunterInterval)
			? hunterInterval
			: DEFAULT_SETTINGS.hunterInterval,
		radarrUrl: radarrUrl,
		radarrApiKey: radarrApiKey,
		sonarrUrl: sonarrUrl,
		sonarrApiKey: sonarrApiKey,
		lidarrUrl: lidarrUrl,
		lidarrApiKey: lidarrApiKey,
	};

	if (JSON.stringify(newConfig) === JSON.stringify(currentConfig)) {
		return;
	}

	logger.warn("[WORKER] 🔄 Settings changed. Reconfiguring worker...");

	if (syncIntervalId) {
		clearInterval(syncIntervalId);
		syncIntervalId = null;
	}

	if (hunterIntervalId) {
		clearInterval(hunterIntervalId);
		hunterIntervalId = null;
	}

	if (newConfig.syncEnabled) {
		logger.info(`[WORKER] ⏰ Sync runs every ${newConfig.syncInterval}m`);
		await syncMissingItems();
		syncIntervalId = setInterval(
			syncMissingItems,
			newConfig.syncInterval * 60000,
		);
	} else {
		logger.info("[WORKER] ⏸️ Worker: Sync is disabled in settings.");
	}

	if (newConfig.hunterEnabled) {
		logger.info(`[WORKER] ⏰ Hunter runs every ${newConfig.hunterInterval}m`);
		await runHunter();
		hunterIntervalId = setInterval(runHunter, newConfig.hunterInterval * 60000);
	} else {
		logger.info("[WORKER] ⏸️ Worker: Hunter is disabled in settings.");
	}

	currentConfig = newConfig;
};

const settingsWatcher = async () => {
	try {
		const settings = await getAllSettings();
		await applySettings(settings);
	} catch (err) {
		logger.error("[WORKER] ⚠️ Failed to load settings: :", err);
	}
};

const cleanupOldDownloads = () => {
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
						logger.info(
							`[WORKER] 🧹 Sweeper: Deleted old zombie file: ${filePath}`,
						);
					}
				}

				if (fs.readdirSync(folderPath).length === 0) {
					fs.rmdirSync(folderPath);
				}
			}
		}
	} catch (err) {
		logger.error("[WORKER] 🧹 Sweeper Error: :", err);
	}
};

const main = async () => {
	logger.info("[WORKER] 🚀 Worker booting...");
	if (!fs.existsSync(DOWNLOAD_DIR))
		fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
	logger.info("[WORKER] 📁 Download directory initialized.");
	await settingsWatcher();
	setInterval(settingsWatcher, 10000);
	logger.info("[WORKER] ✅ Worker started and settings watcher initialized.");
	cleanupOldDownloads();
	setInterval(cleanupOldDownloads, 60 * 60 * 1000);
	logger.info("[WORKER] ✅ Cleanup sweeper initialized.");
};

main().catch((err) => {
	logger.error("[WORKER] Worker failed to start: :", err);
	process.exit(1);
});
