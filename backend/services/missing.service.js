import axios from "axios";
import {
	getMissingMedia,
	unmonitorMissingMedia,
	getAllServices,
	getDownloadQueue,
	recordForceGrabHistory,
} from "../db";
import { coerceNumericId, fetchQueue } from "../utils";
import { generalLogger as logger } from "../logger";

export const MissingService = {
	getMissing: async () => {
		const missingItems = getMissingMedia();

		const [radarrQ, sonarrQ, lidarrQ] = await Promise.all([
			fetchQueue("radarr", "movieId"),
			fetchQueue("sonarr", "episodeId"),
			fetchQueue("lidarr", "albumId"),
		]);

		const eziarrQueue = getDownloadQueue();

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
			};
		});

		const queueItems = [
			...radarrQ,
			...sonarrQ,
			...lidarrQ,
			...normalizedEziarrQueue,
		];

		return { success: true, missing: missingItems, queue: queueItems };
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

		let endpoint = "";
		let payload = {};
		let apiKey = "";
		let baseUrl = "";

		if (service === "radarr") {
			baseUrl = SERVICES.radarr.url;
			apiKey = SERVICES.radarr.apiKey;
			endpoint = "/api/v3/command";
			payload = { name: "MoviesSearch", movieIds: [sid] };
		} else if (service === "sonarr") {
			baseUrl = SERVICES.sonarr.url;
			apiKey = SERVICES.sonarr.apiKey;
			endpoint = "/api/v3/command";
			payload = { name: "EpisodeSearch", episodeIds: [sid] };
		} else if (service === "lidarr") {
			baseUrl = SERVICES.lidarr.url;
			apiKey = SERVICES.lidarr.apiKey;
			endpoint = "/api/v1/command";
			payload = { name: "AlbumSearch", albumIds: [sid] };
		}

		await axios.post(`${baseUrl}${endpoint}`, payload, {
			headers: { "X-Api-Key": apiKey },
			timeout: 30000,
		});

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
			const res = await axios.get(`${SERVICES.prowlarr.url}/api/v1/search`, {
				params: {
					query,
					categories: categories.join(","),
					type: "search",
				},
				headers: { "X-Api-Key": SERVICES.prowlarr.apiKey },
				timeout: 30000,
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
			const res = await axios.get(`${config.url}/api/v3/qualityprofile`, {
				headers: { "X-Api-Key": config.apiKey },
				timeout: 30000,
			});
			const profiles = res.data;
			const existing = profiles.find((p) => p.language?.id === -1);
			if (existing) return { id: existing.id, created: false };

			// Clone the first profile but set language = Any. Radarr-only: Sonarr's
			// quality profiles carry no `language` field at all.
			const clone = {
				...profiles[0],
				id: 0,
				name: "eziarr-any-language",
				language: { id: -1, name: "Any" },
			};
			const created = await axios.post(
				`${config.url}/api/v3/qualityprofile`,
				clone,
				{ headers: { "X-Api-Key": config.apiKey }, timeout: 30000 },
			);
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
				const m = await axios.get(`${config.url}/api/v3/movie/${sid}`, {
					headers: { "X-Api-Key": config.apiKey },
					timeout: 30000,
				});
				originalLanguage = m.data?.originalLanguage;
			} else if (service === "sonarr") {
				const ep = await axios.get(`${config.url}/api/v3/episode/${sid}`, {
					headers: { "X-Api-Key": config.apiKey },
					timeout: 30000,
				});
				const s = await axios.get(
					`${config.url}/api/v3/series/${ep.data.seriesId}`,
					{ headers: { "X-Api-Key": config.apiKey }, timeout: 30000 },
				);
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

	postMissingForceGrab: async ({
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
			return axios.post(
				`${config.url}/api/v3/release/push`,
				{
					title: title,
					downloadUrl: downloadUrl,
					protocol: "Torrent",
					publishDate: new Date().toISOString(),
				},
				{ headers: { "X-Api-Key": config.apiKey }, timeout: 30000 },
			);
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
			// must be rejected outright (unless forceLanguage). release/push's
			// response carries `languages` (plural).
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
				itemEndpoint = "/api/v3/movie";
				if (rejections.includes("language") || rejections.includes("english")) {
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
				const epRes = await axios.get(`${config.url}/api/v3/episode/${sid}`, {
					headers: { "X-Api-Key": config.apiKey },
					timeout: 30000,
				});
				targetId = epRes.data.seriesId;
				itemEndpoint = "/api/v3/series";
			} else if (service === "lidarr") {
				itemEndpoint = "/api/v1/album";
			}

			const itemRes = await axios.get(
				`${config.url}${itemEndpoint}/${targetId}`,
				{ headers: { "X-Api-Key": config.apiKey }, timeout: 30000 },
			);

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
				const profilesRes = await axios.get(
					`${config.url}/api/v3/qualityprofile`,
					{ headers: { "X-Api-Key": config.apiKey }, timeout: 30000 },
				);
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
				await axios.put(`${config.url}${itemEndpoint}/${item.id}`, item, {
					headers: { "X-Api-Key": config.apiKey },
					timeout: 30000,
				});
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

			const apiVer = service === "lidarr" ? "v1" : "v3";
			const queueRes = await axios.get(`${config.url}/api/${apiVer}/queue`, {
				headers: { "X-Api-Key": config.apiKey },
				timeout: 30000,
			});

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
					await axios.delete(
						`${config.url}/api/${apiVer}/queue/${item.id}?removeFromClient=true&blocklist=true`,
						{
							headers: { "X-Api-Key": config.apiKey },
							timeout: 30000,
						},
					);
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
						await axios.put(
							`${config.url}${itemEndpoint}/${originalItem.id}`,
							originalItem,
							{
								headers: { "X-Api-Key": config.apiKey },
								timeout: 30000,
							},
						);
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
						await axios.delete(
							`${config.url}/api/v3/qualityprofile/${createdProfileId}`,
							{ headers: { "X-Api-Key": config.apiKey }, timeout: 30000 },
						);
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
			const getRes = await axios.get(`${config.url}/api/v3/movie/${sid}`, {
				headers: { "X-Api-Key": config.apiKey },
				timeout: 30000,
			});
			const movie = getRes.data;
			movie.monitored = false;
			await axios.put(`${config.url}/api/v3/movie/${sid}`, movie, {
				headers: { "X-Api-Key": config.apiKey },
				timeout: 30000,
			});
		} else if (service === "sonarr") {
			const getRes = await axios.get(`${config.url}/api/v3/episode/${sid}`, {
				headers: { "X-Api-Key": config.apiKey },
				timeout: 30000,
			});
			const episode = getRes.data;
			episode.monitored = false;
			await axios.put(`${config.url}/api/v3/episode/${sid}`, episode, {
				headers: { "X-Api-Key": config.apiKey },
				timeout: 30000,
			});
		} else if (service === "lidarr") {
			const getRes = await axios.get(`${config.url}/api/v1/album/${sid}`, {
				headers: { "X-Api-Key": config.apiKey },
				timeout: 30000,
			});
			const album = getRes.data;
			album.monitored = false;
			await axios.put(`${config.url}/api/v1/album/${sid}`, album, {
				headers: { "X-Api-Key": config.apiKey },
				timeout: 30000,
			});
		}

		unmonitorMissingMedia(`${service}-${sid}`);

		return { success: true, message: `Unmonitored ${service}-${sid}` };
	},
};
