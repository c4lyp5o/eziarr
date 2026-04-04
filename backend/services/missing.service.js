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

	postMissingForceGrab: async ({
		body: { service, serviceId, title, downloadUrl },
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
			logger.info(
				`[SERVER] 🔄 [${service}] Temporarily dropping restrictions...`,
			);

			const profilesRes = await axios.get(
				`${config.url}/api/v3/qualityprofile`,
				{ headers: { "X-Api-Key": config.apiKey }, timeout: 30000 },
			);
			const anyProfile =
				profilesRes.data.find((p) => p.name.toLowerCase() === "any") ||
				profilesRes.data[0];

			let targetId = sid;

			if (service === "radarr") {
				itemEndpoint = "/api/v3/movie";
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

			if (item.qualityProfileId !== anyProfile.id) {
				item.qualityProfileId = anyProfile.id;
				needsUpdate = true;
			}

			if (item.tags && item.tags.length > 0) {
				item.tags = [];
				needsUpdate = true;
			}

			if (service === "sonarr" && item.languageProfileId) {
				try {
					const langRes = await axios.get(
						`${config.url}/api/v3/languageprofile`,
						{
							headers: { "X-Api-Key": config.apiKey },
							timeout: 10000,
						},
					);
					const anyLang =
						langRes.data.find((p) => p.name.toLowerCase() === "any") ||
						langRes.data[0];
					if (anyLang && item.languageProfileId !== anyLang.id) {
						item.languageProfileId = anyLang.id;
						needsUpdate = true;
					}
				} catch (_err) {
					// Ignored
				}
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
