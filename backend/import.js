import fs from "node:fs";
import axios from "axios";
import { translatePath } from "./utils";
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
 * `path` must be the FILE path (D:\Eziarr\Title (Year).ext), NOT the drop
 * folder. Measured on Radarr 6.4.4 (2026-10-04, live production):
 *   - file-path DownloadedMoviesScan -> imports the single file, hasFile
 *     flips true, Move consumes it out of the drop folder.
 *   - folder-path scan -> command "completed" in <5s but imported NOTHING
 *     for flat files in the drop folder. Silent no-op. This is what broke
 *     Tiada Tajuk (2133) + Keluang Man (2283) on 2026-10-03.
 *   - POST /api/v3/manualimport -> 200 but imports nothing (dead end).
 * Do NOT "fix" this back to a folder path without re-measuring on the live
 * Radarr; commit 9bff467 did exactly that from a wrong assumption.
 *
 * On scoping — measured, not assumed:
 *   Radarr silently DROPS `movieId` from DownloadedMoviesScan (it does not
 *   appear in the echoed command body), and Sonarr drops `seriesId` and
 *   `episodeIds` the same way. So the scan is unscoped: it processes every
 *   file matching its parsed filename. `movieId` is still sent because it is
 *   harmless and future *Arr versions may honour it, but what actually
 *   prevents a wrong-item import is that each file is matched by its PARSED
 *   FILENAME ("Polong (2026).mp4" -> Polong), plus the hasFile verification
 *   below, which fails the job rather than reporting a hollow success.
 */
export const buildScanCommand = ({ service, serviceId, filePath }) => {
	if (!filePath) throw new Error("buildScanCommand requires filePath");
	const arrPath = translatePath(filePath);
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

export const triggerArrImport = async ({
	config,
	service,
	serviceId,
	filePath,
}) => {
	const payload = buildScanCommand({ service, serviceId, filePath });

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
