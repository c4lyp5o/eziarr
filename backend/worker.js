import fs from "node:fs";
import path from "node:path";
import { arr } from "./arr";
import {
	getNextItemToSearchMissingMedia,
	markAsSearchedMissingMedia,
	getAllSettings,
	getAllServices,
	upsertTask,
	removeTask,
	markStaleTasks,
	claimNextDownloadQueue,
	unstuckDownloadQueue,
	scheduleRetryDownloadQueue,
	markAsFailedDownloadQueue,
	markDownloadedPayload,
	getQueuedDownloadedPaths,
	finalizeDownloadQueue,
	pruneDownloadQueue,
} from "./db";
import { downloadTelegramFile } from "./telegram";
import { syncMissingItems } from "./sync";
import { downloadHttpFile } from "./downloader";
import {
	triggerArrImport,
	verifyArrImport,
	isImportableService,
	getMovieFileId,
} from "./import";
import { generalLogger as logger, hunterLogger } from "./logger";
import { sweepOldDownloads } from "./utils";
import { DEFAULT_SETTINGS, DOWNLOAD_DIR } from "./config";

const MAX_ATTEMPTS = 5;

let isProcessingQueue = false;

const runHunter = async () => {
	const SERVICES = getAllServices();

	const item = getNextItemToSearchMissingMedia();
	if (!item)
		return hunterLogger.info(
			"[WORKER/HUNTER] 💤 No eligible old items to search.",
		);

	const serviceConfig = SERVICES[item.service];

	if (!serviceConfig.url || !serviceConfig.apiKey)
		return hunterLogger.warn(
			`[WORKER/HUNTER] Service is not configured. Aborting.`,
		);

	let payload = {};

	if (item.service === "radarr") {
		payload = { name: "MoviesSearch", movieIds: [item.serviceId] };
	} else if (item.service === "sonarr") {
		payload = { name: "EpisodeSearch", episodeIds: [item.serviceId] };
	} else if (item.service === "lidarr") {
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
		await arr(serviceConfig, item.service).post("/command", payload);
	} catch (err) {
		hunterLogger.error(`[WORKER/HUNTER] Failed searching ${item.title}: `, err);
	} finally {
		removeTask("worker-hunter");
		markAsSearchedMissingMedia(item.id);
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

	const job = claimNextDownloadQueue();
	if (!job) return;

	isProcessingQueue = true;

	let payload;
	try {
		payload = JSON.parse(job.payload);
	} catch (err) {
		markAsFailedDownloadQueue(job.id, "Invalid job payload JSON");
		finalizeDownloadQueue(job.id, "failed");
		removeTask(job.id);
		isProcessingQueue = false;
		return;
	}

	upsertTask(
		job.id,
		"Download",
		"running",
		`Downloading: ${payload.filename}`,
		0,
	);

	try {
		let result;

		// A retry left over from a failed IMPORT must not pull the bytes again:
		// the file already landed on a previous attempt, so reuse it and go
		// straight to the *Arr scan.
		if (payload.downloadedPath && fs.existsSync(payload.downloadedPath)) {
			logger.info(
				`[WORKER] ♻️ Reusing downloaded file, retrying import only: ${payload.downloadedPath}`,
			);
			result = { filePath: payload.downloadedPath, path: path.dirname(payload.downloadedPath) };
		}

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

		if (!result) {
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
		}

		if (!result || !result.filePath)
				throw new Error("File path missing after download");

		// Persist the completed download before the import scan, so a later
		// import failure retries the scan instead of re-downloading gigabytes.
		if (!payload.downloadedPath) {
			payload.downloadedPath = result.filePath;
			markDownloadedPayload(job.id, result.filePath);
		}

			// Wait for file to be ready on filesystem (handles cross-OS mount latency)
			const waitForFile = async (filePath, timeoutMs = 15000) => {
				const start = Date.now();
				while (Date.now() - start < timeoutMs) {
					if (fs.existsSync(filePath)) return true;
					await new Promise(r => setTimeout(r, 200));
				}
				return false;
			};

			if (!(await waitForFile(result.filePath))) {
				throw new Error(`File not ready after 15s: ${result.filePath}`);
			}

			upsertTask(
			job.id,
			"Importing",
			"running",
			`Sending ${payload.filename} to ${payload.service}...`,
			100,
		);

		// Scan targets the FILE path (measured on Radarr 6.4.4: a folder-path
		// scan completes but silently imports nothing for flat drop-folder files).
		const SERVICES = getAllServices();
		const config = SERVICES[payload.service];

		if (!config || !config.url || !config.apiKey)
			throw new Error(
				`${payload.service} is not configured. Cannot import file.`,
			);

		const verifiable = isImportableService(payload.service);
		const previousFileId = verifiable
			? await getMovieFileId({
					config,
					service: payload.service,
					serviceId: payload.serviceId,
				})
			: null;

		const commandPayload = await triggerArrImport({
			config,
			service: payload.service,
			serviceId: payload.serviceId,
			filePath: result.filePath,
		});

		if (verifiable) {
			const verdict = await verifyArrImport({
				config,
				service: payload.service,
				serviceId: payload.serviceId,
				filePath: result.filePath,
				previousFileId,
			});
			if (!verdict.imported) {
				// Nothing imported — fail loudly instead of a hollow ✅, so the
				// job surfaces (and retries) instead of vanishing until the
				// sweeper deletes the evidence 24h later.
				throw new Error(
					`${payload.filename} downloaded but ${payload.service} never imported it: ${verdict.reason}`,
				);
			}
			logger.info(`[WORKER] ✅ Download & Import complete: ${payload.filename}`);
		} else {
			// Unverifiable service: the scan was queued, but we can't prove it
			// imported, so don't claim it did.
			logger.info(
				`[WORKER] ⏳ Download complete, scan queued for ${payload.filename} (${payload.service} scan is not verifiable): ${commandPayload.name}`,
			);
		}
		finalizeDownloadQueue(job.id, "completed", result);
	} catch (err) {
		const msg = err?.message ?? String(err);

		const attempts = Number(job.attempts ?? 0);

		if (attempts + 1 >= MAX_ATTEMPTS) {
			markAsFailedDownloadQueue(job.id, msg);
			finalizeDownloadQueue(job.id, "failed");
		} else {
			scheduleRetryDownloadQueue(job.id, msg);
		}

		logger.error(`[WORKER] ❌ Download Job Failed: `, err);
	} finally {
		removeTask(job.id);
		isProcessingQueue = false;
	}
};

const cleanupOldDownloads = () => {
	if (!fs.existsSync(DOWNLOAD_DIR)) return;

	const MAX_AGE_MS = 24 * 60 * 60 * 1000;

	try {
		upsertTask(
			"worker-sweeper",
			"Sweeper",
			"running",
			"Cleaning up old downloads...",
		);
		logger.info("[WORKER/SWEEPER] 🧹 Cleaning up old downloads...");
		const deleted = sweepOldDownloads(DOWNLOAD_DIR, {
			maxAgeMs: MAX_AGE_MS,
			keep: getQueuedDownloadedPaths(),
		});
		for (const filePath of deleted) {
			logger.info(
				`[WORKER/SWEEPER] 🧹 Sweeper: Deleted old zombie file: ${filePath}`,
			);
		}
		logger.info("[WORKER/SWEEPER] ✅ Cleanup sweeper complete.");
	} catch (err) {
		logger.error("[WORKER/SWEEPER] 🧹 Sweeper Error: :", err);
	} finally {
		removeTask("worker-sweeper");
	}
};

const main = async () => {
	logger.info("[WORKER] 🚀 Worker booting.");
	if (!fs.existsSync(DOWNLOAD_DIR))
		fs.mkdirSync(DOWNLOAD_DIR, {
			recursive: true,
		});
	unstuckDownloadQueue();
	pruneDownloadQueue();
	markStaleTasks();
	cleanupOldDownloads();
	await settingsWatcher();
	// set recurring tasks
	setInterval(settingsWatcher, 10000);
	setInterval(cleanupOldDownloads, 60 * 60 * 1000);
	setInterval(processDownloadQueue, 5000);
	logger.info("[WORKER] ✅ Worker initialized.");
};

main().catch((err) => {
	logger.error("[WORKER] Worker failed to start: :", err);
	process.exit(1);
});
