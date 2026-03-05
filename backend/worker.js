import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import {
	upsertItem,
	getNextItemToSearch,
	markAsSearched,
	getItems,
	deleteItem,
	getAllSettings,
	getServicesConfig,
	upsertTask,
	removeTask,
	clearAllTasks,
	getNextDownloadJob,
	updateDownloadJobStatus,
	removeDownloadJob,
	resetStuckDownloads,
} from "./db";
import { downloadTelegramFile } from "./telegram";
import { downloadHttpFile } from "./downloader";
import { generalLogger as logger, hunterLogger } from "./logger";
import { getPosterUrl, translatePath } from "./utils";
import { DEFAULT_SETTINGS, DOWNLOAD_DIR } from "./config";

let isProcessingQueue = false;

const syncMissingItems = async () => {
	const SERVICES = getServicesConfig();

	const activeIds = new Set();
	const successfulServices = new Set();

	try {
		upsertTask("worker-sync", "Sync", "running", "Syncing missing items...");
		logger.info("[WORKER/SYNC] 🔄 Syncing missing items...");

		if (SERVICES.radarr.url && SERVICES.radarr.apiKey) {
			// 1. RADARR
			try {
				const radarrRes = await axios.get(
					`${SERVICES.radarr.url}/api/v3/wanted/missing`,
					{
						params: {
							pageSize: 100,
							sortKey: "releaseDate",
							sortDir: "desc",
						},
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
				successfulServices.add("radarr");
			} catch (err) {
				logger.error("[WORKER] Radarr Sync Error :", err);
			}
		} else {
			logger.warn("[WORKER/SYNC] Radarr not configured. Skipping sync.");
		}

		if (SERVICES.sonarr.url && SERVICES.sonarr.apiKey) {
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
				successfulServices.add("sonarr");
			} catch (err) {
				logger.error("[WORKER/SYNC] Sonarr Sync Error :", err);
			}
		} else {
			logger.warn("[WORKER/SYNC] Sonarr not configured. Skipping sync.");
		}

		if (SERVICES.lidarr.url && SERVICES.lidarr.apiKey) {
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
				successfulServices.add("lidarr");
			} catch (err) {
				logger.error("[WORKER/SYNC] Lidarr Sync Error :", err);
			}
		} else {
			logger.warn("[WORKER/SYNC] Lidarr not configured. Skipping sync.");
		}

		// 4. CLEANUP (Soft Sync)
		const allDbItems = getItems();
		const idsToDelete = allDbItems
			.filter(
				(item) =>
					successfulServices.has(item.service) && !activeIds.has(item.id),
			)
			.map((item) => item.id);

		if (idsToDelete.length > 0) {
			logger.info(
				`[WORKER] 🧹 Cleaning up ${idsToDelete.length} downloaded/removed items...`,
			);
			idsToDelete.forEach((id) => {
				deleteItem(id);
			});
		}

		logger.info("[WORKER] ✅ Worker Sync Complete");
	} catch (err) {
		logger.error("[WORKER] Worker Sync Failed: :", err);
	} finally {
		removeTask("worker-sync");
	}
};

const runHunter = async () => {
	const SERVICES = getServicesConfig();

	const item = getNextItemToSearch();
	if (!item)
		return hunterLogger.info(
			"[WORKER/HUNTER] 💤 No eligible old items to search.",
		);

	const serviceConfig = SERVICES[item.service];

	if (!serviceConfig.url || !serviceConfig.apiKey)
		return hunterLogger.warn(
			`[WORKER/HUNTER] Service is not configured. Aborting.`,
		);

	let endpoint = "/api/v3/command";
	let payload = {};

	if (item.service === "radarr") {
		payload = { name: "MoviesSearch", movieIds: [item.serviceId] };
	} else if (item.service === "sonarr") {
		payload = { name: "EpisodeSearch", episodeIds: [item.serviceId] };
	} else if (item.service === "lidarr") {
		endpoint = "/api/v1/command";
		payload = { name: "AlbumSearch", albumIds: [item.serviceId] };
	}

	try {
		upsertTask(
			"worker-hunter",
			"Hunter",
			"running",
			`Hunting for: ${item.title}`,
		);
		hunterLogger.info(
			`[WORKER/HUNTER] 🎯 Searching [${item.service}] ${item.title}`,
		);
		await axios.post(`${serviceConfig.url}${endpoint}`, payload, {
			headers: { "X-Api-Key": serviceConfig.apiKey },
			timeout: 30000,
		});
	} catch (err) {
		hunterLogger.error(`[WORKER/HUNTER] Failed searching ${item.title}: `, err);
	} finally {
		removeTask("worker-hunter");
		markAsSearched(item.id);
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

	if (JSON.stringify(newConfig) === JSON.stringify(currentConfig)) return;

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

const processDownloadQueue = async () => {
	if (isProcessingQueue) return;

	const job = getNextDownloadJob();
	if (!job) return;

	isProcessingQueue = true;
	updateDownloadJobStatus(job.id, "downloading");

	const payload = JSON.parse(job.payload);
	upsertTask(
		job.id,
		"Download",
		"running",
		`Downloading: ${payload.filename}`,
		0,
	);

	try {
		let result;

		let lastPercent = -1;
		const progressCallback = (percent) => {
			if (percent !== lastPercent && percent >= 0 && percent <= 100) {
				lastPercent = percent;
				upsertTask(
					job.id,
					"Download",
					"running",
					`Downloading: ${payload.filename} (${percent}%)`,
					percent,
				);
			}
		};

		if (job.type === "telegram") {
			result = await downloadTelegramFile(
				payload.channel,
				payload.messageId,
				payload.filename,
				progressCallback,
			);
		} else if (job.type === "http") {
			result = await downloadHttpFile(
				payload.url,
				payload.filename,
				progressCallback,
			);
		}

		if (!result || !result.filePath)
			throw new Error("File path missing after download");

		upsertTask(
			job.id,
			"Importing",
			"running",
			`Sending ${payload.filename} to ${payload.service}...`,
			100,
		);

		// --- Trigger *Arr Import ---
		const arrPath = translatePath(result.filePath);
		const SERVICES = getServicesConfig();
		const config = SERVICES[payload.service];

		if (!config || !config.url || !config.apiKey) {
			throw new Error(
				`${payload.service} is not configured. Cannot import file.`,
			);
		}

		const commandName =
			payload.service === "radarr"
				? "DownloadedMoviesScan"
				: payload.service === "sonarr"
					? "DownloadedEpisodesScan"
					: "DownloadedAlbumsScan";

		const commandPayload = {
			name: commandName,
			path: arrPath,
			importMode: "Move",
		};
		if (payload.service === "radarr")
			commandPayload.movieId = payload.serviceId;

		const apiVer = payload.service === "lidarr" ? "v1" : "v3";

		await axios.post(`${config.url}/api/${apiVer}/command`, commandPayload, {
			headers: { "X-Api-Key": config.apiKey },
			timeout: 30000,
		});

		logger.info(`[WORKER] ✅ Download & Import complete: ${payload.filename}`);
		removeDownloadJob(job.id);
	} catch (err) {
		logger.error(`[WORKER] ❌ Download Job Failed: `, err);
		updateDownloadJobStatus(job.id, "failed");
	} finally {
		removeTask(job.id);
		isProcessingQueue = false;
	}
};

const cleanupOldDownloads = () => {
	if (!fs.existsSync(DOWNLOAD_DIR)) return;

	const MAX_AGE_MS = 24 * 60 * 60 * 1000;
	const now = Date.now();

	try {
		upsertTask(
			"worker-sweeper",
			"Sweeper",
			"running",
			"Cleaning up old downloads...",
		);
		logger.info("[WORKER/SWEEPER] 🧹 Cleaning up old downloads...");
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
						try {
							fs.unlinkSync(filePath);
							logger.info(
								`[WORKER/SWEEPER] 🧹 Sweeper: Deleted old zombie file: ${filePath}`,
							);
						} catch (err) {
							logger.warn(
								`[WORKER/SWEEPER] 🧹 Sweeper: Skipped file ${filePath} (Likely in use)`,
							);
						}
					}
				}

				try {
					if (fs.readdirSync(folderPath).length === 0) {
						fs.rmdirSync(folderPath);
					}
				} catch (err) {
					// It's perfectly fine if this fails. Maybe a downloader is working
				}
			}
		}
		logger.info("[WORKER/SWEEPER] ✅ Cleanup sweeper complete.");
	} catch (err) {
		logger.error("[WORKER/SWEEPER] 🧹 Sweeper Error: :", err);
	} finally {
		removeTask("worker-sweeper");
	}
};

const main = async () => {
	logger.info("[WORKER] 🚀 Worker booting...");
	clearAllTasks();
	resetStuckDownloads();
	if (!fs.existsSync(DOWNLOAD_DIR))
		fs.mkdirSync(DOWNLOAD_DIR, {
			recursive: true,
		});
	logger.info("[WORKER] 📁 Download directory initialized.");
	await settingsWatcher();
	setInterval(settingsWatcher, 10000);
	setInterval(processDownloadQueue, 5000);
	logger.info("[WORKER] ✅ Worker started and settings watcher initialized.");
	cleanupOldDownloads();
	setInterval(cleanupOldDownloads, 60 * 60 * 1000);
	logger.info("[WORKER] ✅ Cleanup sweeper initialized.");
};

main().catch((err) => {
	logger.error("[WORKER] Worker failed to start: :", err);
	process.exit(1);
});
