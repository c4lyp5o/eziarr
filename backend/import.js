import fs from "node:fs";
import axios from "axios";
import { translatePath } from "./utils";
import { DOWNLOAD_DIR } from "./config";
import { generalLogger as logger } from "./logger";

const API_VER = (service) => (service === "lidarr" ? "v1" : "v3");

const scanCommandName = (service) => {
	if (service === "radarr") return "DownloadedMoviesScan";
	if (service === "sonarr") return "DownloadedEpisodesScan";
	return "DownloadedAlbumsScan";
};

/**
 * Ask the *Arr to import the file we just downloaded.
 *
 * `path` must be the SHARED IMPORT FOLDER (D:\Eziarr), not the file path. A
 * bare file path is only understood by the Manual Import (list) mechanism, so
 * a `DownloadedMoviesScan` pointed at a file silently no-ops: the command is
 * accepted (HTTP 201, status queued) and nothing is ever imported. That is
 * exactly how Polong (2026) downloaded but never imported.
 *
 * On scoping — measured, not assumed:
 *   Radarr silently DROPS `movieId` from DownloadedMoviesScan (it does not
 *   appear in the echoed command body), and Sonarr drops `seriesId` and
 *   `episodeIds` the same way. So the scan is unscoped: it processes every
 *   file sitting in the drop folder. `movieId` is still sent because it is
 *   harmless and future *Arr versions may honour it, but what actually
 *   prevents a wrong-item import is that each file is matched by its PARSED
 *   FILENAME ("Polong (2026).mp4" -> Polong), plus the hasFile verification
 *   below, which fails the job rather than reporting a hollow success.
 */
export const buildScanCommand = ({ service, serviceId }) => {
	// Derived here, never passed in: no caller can hand us a file path by
	// mistake (that is exactly how the silent no-op was introduced).
	const arrPath = translatePath(DOWNLOAD_DIR);
	const payload = {
		name: scanCommandName(service),
		path: arrPath,
		importMode: "Move",
	};
	if (service === "radarr") {
		const sid = Number(serviceId);
		if (Number.isFinite(sid) && sid > 0) payload.movieId = sid;
	}
	return payload;
};

export const triggerArrImport = async ({ config, service, serviceId }) => {
	const payload = buildScanCommand({ service, serviceId });

	await axios.post(
		`${config.url}/api/${API_VER(service)}/command`,
		payload,
		{ headers: { "X-Api-Key": config.apiKey }, timeout: 30000 },
	);

	return payload;
};

const hasFile = (item) =>
	item?.hasFile === true ||
	item?.movieFile != null ||
	item?.episodeFile != null;

export const isImportableService = (service) => service === "radarr";

/**
 * The *Arr scan is fire-and-forget, so "the command was accepted" proves
 * nothing — a scan pointed at a path the *Arr can't use is accepted and then
 * silently does nothing. Poll the target movie and only celebrate when the
 * file actually landed, or when the file left our side (a "Move" import
 * consumes it out of the drop folder).
 *
 * Only Radarr is verifiable: `/movie/{id}` answers "do you have a file?" for
 * the one movie this job was about. Sonarr's equivalent is per-episode and its
 * episodeId points at ONE episode while a Telegram drop is usually a whole
 * season, so a "has any file" check there would report success for a partial
 * import — that job stays unverified rather than guessing. Same for Lidarr.
 */
export const verifyArrImport = async ({
	config,
	service,
	serviceId,
	filePath,
	timeoutMs = 120000,
	intervalMs = 5000,
	sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}) => {
	const deadline = Date.now() + timeoutMs;
	let lastError = null;

	do {
		try {
			const res = await axios.get(
				`${config.url}/api/${API_VER(service)}/movie/${Number(serviceId)}`,
				{ headers: { "X-Api-Key": config.apiKey }, timeout: 15000 },
			);
			if (hasFile(res.data)) {
				logger.info(
					`[WORKER] ✅ Import verified: movie ${serviceId} now has a file.`,
				);
				return { imported: true };
			}
		} catch (err) {
			lastError = err?.message ?? String(err);
			// 404 = the movieId we were handed doesn't exist; no point polling.
			if (err?.response?.status === 404) {
				return {
					imported: false,
					reason: `${service} has no item with id ${serviceId}`,
				};
			}
		}

		// Radarr moves the file out of the drop folder as it imports it, so a
		// vanished file is a second, independent confirmation.
		if (filePath && !fs.existsSync(filePath)) {
			logger.info(`[WORKER] ✅ Import verified: ${filePath} was consumed.`);
			return { imported: true, consumed: true };
		}

		await sleep(intervalMs);
	} while (Date.now() < deadline);

	return {
		imported: false,
		reason: lastError
			? `Scan imported nothing (last ${service} API error: ${lastError})`
			: `Scan imported nothing for movie ${serviceId} within ${Math.round(timeoutMs / 1000)}s`,
	};
};
