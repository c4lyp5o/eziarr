import { arr } from "../arr";
import {
	getMissingMedia,
	unmonitorMissingMedia,
	getAllServices,
	getDownloadQueue,
	recordForceGrabHistory,
	getTasks,
} from "../db";
import { coerceNumericId, fetchAllQueues } from "../utils";
import { generalLogger as logger } from "../logger";

const TEMP_PROFILE_NAME = "eziarr-any-language";

// Force-grab swaps a title's profile, grabs, then restores and removes the
// temp profile. Two at once on one *Arr would share that temp profile and the
// first to finish would delete it from under the second, so they run one at
// a time per service (the server is a single process).
const forceGrabQueues = new Map();
const oneAtATime = (key, fn) => {
	const previous = forceGrabQueues.get(key) ?? Promise.resolve();
	const run = previous.then(fn, fn);
	forceGrabQueues.set(
		key,
		run.catch(() => {}),
	);
	return run;
};

export const MissingService = {
	getMissing: async () => {
		const missingItems = getMissingMedia();

		const { items: arrQueue, unavailable } = await fetchAllQueues();

		const eziarrQueue = getDownloadQueue();
		// The worker reports live percent on its task row, keyed by job id.
		const taskProgress = new Map(getTasks().map((t) => [t.id, t.progress]));

		const normalizedEziarrQueue = eziarrQueue.map((item) => {
			let payload;
			try {
				payload =
					typeof item.payload === "string"
						? JSON.parse(item.payload)
						: item.payload;
			} catch {
				payload = {};
			}

			return {
				service: "eziarr",
				serviceId: Number(payload.serviceId ?? 0),
				status: item.status ?? "unknown",
				trackStatus: "ok",
				title: payload.title ?? payload.filename ?? "Queued download",
				quality: payload.quality ?? undefined,
				indexer: payload.indexer ?? undefined,
				timeleft: "",
				progress: taskProgress.get(item.id) ?? null,
			};
		});

		const queueItems = [...arrQueue, ...normalizedEziarrQueue];

		return {
			success: true,
			missing: missingItems,
			queue: queueItems,
			unavailable,
		};
	},

	postMissingSearch: async ({ body: { service, id } }) => {
		const SERVICES = getAllServices();
		const config = SERVICES[service];

		if (!config) {
			return { success: false, message: "Invalid service" };
		}

		if (!config.url || !config.apiKey) {
			logger.warn(`[SERVER] ${service} is not configured.`);
			return {
				success: false,
				message: `${service} is not configured.`,
			};
		}

		const sid = coerceNumericId(id, "id");

		const SEARCH_COMMAND = {
			radarr: { name: "MoviesSearch", movieIds: [sid] },
			sonarr: { name: "EpisodeSearch", episodeIds: [sid] },
			lidarr: { name: "AlbumSearch", albumIds: [sid] },
		};
		await arr(config, service).post("/command", SEARCH_COMMAND[service]);

		return {
			success: true,
			message: `Search triggered for ${service} item ${sid}`,
		};
	},

	postMissingDeepSearch: async ({ body: { type, query } }) => {
		const SERVICES = getAllServices();
		if (!SERVICES.prowlarr.url || !SERVICES.prowlarr.apiKey) {
			logger.warn("[WORKER] Deepsearch is not configured");
			return { success: false, torrents: [] };
		}

		// Map Service Types to Prowlarr Categories
		// 2000 = Movies, 5000 = TV, 3000 = Audio
		const categories =
			type === "movie" ? [2000] : type === "episode" ? [5000] : [3000];

		{
			const res = await arr(SERVICES.prowlarr, "prowlarr").get("/search", {
				params: {
					query,
					categories: categories.join(","),
					type: "search",
				},
			});

			const torrents = res.data
				.map((r) => ({
					title: r.title,
					size: r.size,
					indexer: r.indexer,
					seeders: r.seeders,
					leechers: r.leechers,
					age: r.age,
					downloadUrl: r.downloadUrl || r.magnetUrl,
					guid: r.guid,
				}))
				.sort((a, b) => b.seeders - a.seeders);

			return { success: true, torrents };
		}
	},

	// --- Language bypass helpers (Fix A + Fix B) -------------------------
	// Ground truth measured live 2026-10-03:
	//   Radarr: /languageprofile = 404. Language lives on qualityProfile.language
	//           (all 6 shipped profiles = {id:1,English}). /language has id -1="Any".
	//           POST /qualityprofile with language:{id:-1} works (201) and DELETEs (200).
	//   Sonarr: /languageprofile exists but only returns one "Deprecated" profile
	//           (English only). Its POST and PUT both return 202 but NEVER persist —
	//           no writable path to allow non-English. So Sonarr cannot be bypassed
	//           by profile swap; it fails honestly instead of silently.

	// Find (or create, on Radarr only) a quality profile whose language is "Any".
	// Returns {id, created} or null when there is no writable path.
	_ensureAnyLanguageProfile: async (config) => {
		try {
			const res = await arr(config, "radarr").get("/qualityprofile");
			const profiles = res.data;

			// A temp profile left by an earlier run (a crash before cleanup) is
			// ours: reuse it and remove it afterwards, rather than mistaking it
			// for one of the user's and leaving it on Radarr forever.
			const leftover = profiles.find((p) => p.name === TEMP_PROFILE_NAME);
			if (leftover) return { id: leftover.id, created: true };

			const existing = profiles.find((p) => p.language?.id === -1);
			if (existing) return { id: existing.id, created: false };

			// Clone the "Any" quality profile (the one the non-language path
			// relaxes to) with language = Any, so a release rejected for language
			// AND quality isn't still rejected for quality. Radarr-only: Sonarr's
			// quality profiles carry no `language` field at all.
			const base =
				profiles.find((p) => p.name?.toLowerCase() === "any") || profiles[0];
			const clone = {
				...base,
				id: 0,
				name: TEMP_PROFILE_NAME,
				language: { id: -1, name: "Any" },
			};
			const created = await arr(config, "radarr").post("/qualityprofile", clone);
			// Verify it actually persisted — a 2xx echo that didn't write is the
			// exact bug we fixed in PR #40, so never trust the status code alone.
			if (!created.data?.id) return null;
			return { id: created.data.id, created: true };
		} catch (err) {
			logger.warn(
				`[SERVER] ⚠️ Could not ensure Any-language profile: ${err.message}`,
			);
			return null;
		}
	},

	// Decide whether the release's language is allowed for this title (Fix B).
	// We only bypass when the release language matches the title's original
	// language (or the title's original language is Unknown/Original, i.e. we
	// have no signal). A German rip of an English title stays rejected.
	// ReleasLanguages comes from release/push's `languages` field (plural).
	_languageAllowsBypass: async (config, service, sid, releaseLanguages, forceLanguage) => {
		if (forceLanguage) return { allowed: true, reason: "forceLanguage override" };
		if (!Array.isArray(releaseLanguages) || releaseLanguages.length === 0)
			return { allowed: true, reason: "no release language signal, proceeding" };

		// Read the title's original language.
		let originalLanguage = null;
		try {
			if (service === "radarr") {
				const m = await arr(config, service).get(`/movie/${sid}`);
				originalLanguage = m.data?.originalLanguage;
			} else if (service === "sonarr") {
				const ep = await arr(config, service).get(`/episode/${sid}`);
				const s = await arr(config, service).get(`/series/${ep.data.seriesId}`);
				originalLanguage = s.data?.originalLanguage;
			}
		} catch (err) {
			logger.warn(
				`[SERVER] ⚠️ Could not read original language for ${service}:${sid}: ${err.message}`,
			);
			// No signal — allow, but the caller logs it. Fail-open here because we
			// genuinely don't know; the guard's job is to catch clear mismatches.
			return { allowed: true, reason: "original language unavailable" };
		}

		// id -2 = Original, 0 = Unknown, or missing => no reliable guard target.
		if (!originalLanguage || [0, -2, undefined].includes(originalLanguage.id))
			return { allowed: true, reason: "title original language is Unknown/Original" };

		const origName = (originalLanguage.name || "").toLowerCase();
		const matches = releaseLanguages.some(
			(rl) => (rl?.name || "").toLowerCase() === origName,
		);
		if (matches) return { allowed: true, reason: `release matches ${originalLanguage.name}` };

		return {
			allowed: false,
			reason: `release is ${releaseLanguages.map((l) => l?.name).join("/") || "unknown"} but ${service} title's original language is ${originalLanguage.name}`,
		};
	},

	postMissingForceGrab: (ctx) =>
		oneAtATime(ctx.body.service, () => MissingService._forceGrab(ctx)),

	_forceGrab: async ({
		body: { service, serviceId, title, downloadUrl, forceLanguage },
	}) => {
		const SERVICES = getAllServices();
		const config = SERVICES[service];

		if (!config) {
			return { success: false, message: "Invalid service" };
		}

		if (!config.url || !config.apiKey) {
			logger.warn(`[SERVER] ${service} is not configured.`);
			return {
				success: false,
				message: `${service} is not configured.`,
			};
		}

		const sid = coerceNumericId(serviceId, "serviceId");

		const pushRelease = async () => {
			return arr(config, service).post("/release/push", {
					title: title,
					downloadUrl: downloadUrl,
					protocol: "Torrent",
					publishDate: new Date().toISOString(),
				});
		};

		let res = await pushRelease();
		if (!res.data[0].rejected) {
			recordForceGrabHistory(service, sid, title, downloadUrl, true);
			return { success: true, message: "Grabbed successfully" };
		}

		const rejections = res.data[0].rejections.join(" ").toLowerCase();
		logger.warn(`[SERVER] ⚠️ [${service}] Grab Rejected: ${rejections}`);

		let actionsTaken = false;
		let originalItem = null;
		let itemEndpoint = "";
		let createdProfileId = null;
		let forcedProfileId = null;

		if (
			rejections.includes("profile") ||
			rejections.includes("cutoff") ||
			rejections.includes("wanted") ||
			rejections.includes("language") ||
			rejections.includes("format") ||
			rejections.includes("score") ||
			rejections.includes("english") ||
			rejections.includes("size")
		) {
			// --- Fix B: decide the language bypass BEFORE touching anything ---
			// A wrong-language release for a title whose original language differs
			// must be rejected outright (unless forceLanguage). Only gate when the
			// *Arr actually rejected on language: a size/profile-only rejection
			// never asked for a language bypass. release/push's response carries
			// `languages` (plural).
			const isLanguageRejection =
				rejections.includes("language") || rejections.includes("english");
			if (isLanguageRejection) {
				const releaseLanguages = res.data[0]?.languages || [];
				const langGate = await MissingService._languageAllowsBypass(
					config,
					service,
					sid,
					releaseLanguages,
					forceLanguage,
				);
				if (!langGate.allowed) {
					logger.warn(
						`[SERVER] 🚫 [${service}] Language mismatch, not bypassing: ${langGate.reason}`,
					);
					recordForceGrabHistory(service, sid, title, downloadUrl, false, langGate.reason);
					return {
						success: false,
						message: `Not grabbing: ${langGate.reason}. Pass forceLanguage=true to grab anyway.`,
					};
				}
				if (langGate.reason !== "forceLanguage override") {
					logger.info(`[SERVER] ℹ️ [${service}] Language gate: ${langGate.reason}`);
				}
			}

			logger.info(
				`[SERVER] 🔄 [${service}] Temporarily dropping restrictions...`,
			);

			// --- Fix A: lift the LANGUAGE restriction the swap used to miss ---
			// Radarr's blocker is qualityProfile.language=English, so swap the
			// movie onto an "Any"-language profile. Sonarr's language profile is
			// not writable (202 no-op), so there we cannot lift it — but a
			// language-matching release won't be rejected for language anyway.
			let targetId = sid;
			let isLanguageBypass = false;

			if (service === "radarr") {
				itemEndpoint = "/movie";
				if (isLanguageRejection) {
					const anyLangProfile =
						await MissingService._ensureAnyLanguageProfile(config);
					if (anyLangProfile) {
						createdProfileId = anyLangProfile.created
							? anyLangProfile.id
							: null;
						isLanguageBypass = true;
						forcedProfileId = anyLangProfile.id;
					}
				}
			} else if (service === "sonarr") {
				const epRes = await arr(config, service).get(`/episode/${sid}`);
				targetId = epRes.data.seriesId;
				itemEndpoint = "/series";
			} else if (service === "lidarr") {
				itemEndpoint = "/album";
			}

			const itemRes = await arr(config, service).get(`${itemEndpoint}/${targetId}`);

			const item = itemRes.data;

			originalItem = JSON.parse(JSON.stringify(item));

			let needsUpdate = false;

			if (service === "radarr" && isLanguageBypass) {
				// Language bypass: point at the Any-language profile.
				if (item.qualityProfileId !== forcedProfileId) {
					item.qualityProfileId = forcedProfileId;
					needsUpdate = true;
				}
			} else {
				// Non-language rejections (profile/cutoff/size/score): keep the
				// original "relax the quality profile" behaviour.
				const profilesRes = await arr(config, service).get("/qualityprofile");
				const anyProfile =
					profilesRes.data.find((p) => p.name.toLowerCase() === "any") ||
					profilesRes.data[0];
				if (item.qualityProfileId !== anyProfile.id) {
					item.qualityProfileId = anyProfile.id;
					needsUpdate = true;
				}
			}

			if (item.tags && item.tags.length > 0) {
				item.tags = [];
				needsUpdate = true;
			}

			if (needsUpdate) {
				await arr(config, service).put(`${itemEndpoint}/${item.id}`, item);
				actionsTaken = true;
			}
		}

		if (
			rejections.includes("queue") ||
			rejections.includes("equal or higher preference")
		) {
			logger.info(
				`[SERVER] 🔄 [${service}] Removing blocking item from Queue...`,
			);

			const queueRes = await arr(config, service).get("/queue");

			const idKey =
				service === "radarr"
					? "movieId"
					: service === "sonarr"
						? "episodeId"
						: "albumId";

			const blockingItems = queueRes.data.records.filter(
				(q) => Number(q[idKey]) === sid,
			);

			for (const item of blockingItems) {
				try {
					await arr(config, service).delete(`/queue/${item.id}?removeFromClient=true&blocklist=true`);
					logger.info(
						`[SERVER] 🔄 [${service}] Deleted queue item: ${item.id}`,
					);
					actionsTaken = true;
				} catch (err) {
					logger.error(
						`[${service}] Failed to delete queue item ${item.id}: ${err.message}`,
					);
				}
			}
		}

		if (actionsTaken) {
			await new Promise((r) => setTimeout(r, 1000));

			try {
				res = await pushRelease();
				if (!res.data[0].rejected) {
					recordForceGrabHistory(service, sid, title, downloadUrl, true);
					return {
						success: true,
						message: "Grabbed! (Bypassed Restrictions)",
					};
				} else {
					recordForceGrabHistory(
						service,
						sid,
						title,
						downloadUrl,
						false,
						res.data[0].rejections[0],
					);
					return {
						success: false,
						message: `Still rejected: ${res.data[0].rejections[0]}`,
					};
				}
			} finally {
				// RESTORE ORIGINAL SETTINGS
				if (originalItem) {
					logger.info(
						`[SERVER] 🔄 [${service}] Restoring original settings for "${originalItem.title}"...`,
					);
					try {
						await arr(config, service).put(`${itemEndpoint}/${originalItem.id}`, originalItem);
					} catch (restoreErr) {
						logger.error(
							`[SERVER] Failed to restore original item settings: ${restoreErr.message}`,
						);
					}
				}

				// Delete the temporary Any-language profile we created, so repeated
				// force-grabs don't accumulate junk profiles on Radarr.
				if (createdProfileId) {
					try {
						await arr(config, service).delete(`/qualityprofile/${createdProfileId}`);
						logger.info(
							`[SERVER] 🧹 [${service}] Removed temp Any-language profile ${createdProfileId}`,
						);
					} catch (delErr) {
						logger.warn(
							`[SERVER] ⚠️ Could not delete temp profile ${createdProfileId}: ${delErr.message}`,
						);
					}
				}
			}
		}

		recordForceGrabHistory(service, sid, title, downloadUrl, false, rejections);

		return { success: false, message: `Rejected: ${rejections}` };
	},

	postMissingUnmonitor: async ({ body: { service, serviceId } }) => {
		const SERVICES = getAllServices();
		const config = SERVICES[service];

		if (!config) {
			return { success: false, message: "Invalid service" };
		}

		if (!config.url || !config.apiKey) {
			logger.warn(`[SERVER] ${service} is not configured.`);
			return {
				success: false,
				message: `${service} is not configured.`,
			};
		}

		const sid = coerceNumericId(serviceId, "serviceId");

		if (service === "radarr") {
			const getRes = await arr(config, service).get(`/movie/${sid}`);
			const movie = getRes.data;
			movie.monitored = false;
			await arr(config, service).put(`/movie/${sid}`, movie);
		} else if (service === "sonarr") {
			const getRes = await arr(config, service).get(`/episode/${sid}`);
			const episode = getRes.data;
			episode.monitored = false;
			await arr(config, service).put(`/episode/${sid}`, episode);
		} else if (service === "lidarr") {
			const getRes = await arr(config, service).get(`/album/${sid}`);
			const album = getRes.data;
			album.monitored = false;
			await arr(config, service).put(`/album/${sid}`, album);
		}

		unmonitorMissingMedia(`${service}-${sid}`);

		return { success: true, message: `Unmonitored ${service}-${sid}` };
	},
};
