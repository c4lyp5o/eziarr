import { join } from "node:path";
import { Elysia, t, file } from "elysia";
import { cors } from "@elysiajs/cors";
import { staticPlugin } from "@elysiajs/static";
// import { openapi } from "@elysiajs/openapi";
import axios from "axios";
import {
	getTelegramClient,
	sendLoginCode,
	completeLogin,
	searchChannel,
	downloadMedia,
} from "./telegram";
import { searchInternetArchive, getInternetArchiveFiles } from "./ia";
import { scanOpenDir } from "./opendir";
import { downloadHttpFile } from "./downloader";
import {
	getItems,
	deleteItem,
	getAllSettings,
	setSetting,
	getServicesConfig,
} from "./db";
import { generalLogger as logger } from "./logger";
import { coerceNumericId, fetchQueue, translatePath } from "./utils";

export const app = new Elysia()
	.onError(({ code, error, set }) => {
		if (code === "VALIDATION") {
			process.env.NODE_ENV === "development" ||
				(process.env.NODE_ENV === "dev" && logger.error(error));
			set.status = 400;
			return { success: false, message: "Bad request data" };
		}
		if (code === "NOT_FOUND") {
			set.status = 404;
			return { success: false, message: "Not Found" };
		}

		set.status = 500;
		logger.error(`[SERVER] 💥[${code}] Server Error: `, error);
		const message =
			process.env.NODE_ENV === "development" || process.env.NODE_ENV === "dev"
				? error.message
				: "Internal Server Error";
		return { success: false, message };
	})

	.use(cors())

	// .use(
	// 	openapi({
	// 		enabled:
	// 			process.env.NODE_ENV === "development" ||
	// 			process.env.NODE_ENV === "dev",
	// 		exclude: {
	// 			paths: ["/", "/*", ""],
	// 		},
	// 		documentation: {
	// 			info: {
	// 				title: "Eziarr API 🍿",
	// 				version: "1.0.0",
	// 				description:
	// 					"The ultimate backend for managing missing *Arr media, scraping Telegram, and deep-searching the high seas.",
	// 				contact: {
	// 					name: "c4lyp5o",
	// 					url: "https://github.com/c4lyp5o/eziarr",
	// 					email: "calypso[at]calypsocloud.one",
	// 				},
	// 				license: {
	// 					name: "MIT",
	// 					url: "https://opensource.org/licenses/MIT",
	// 				},
	// 			},
	// 			servers: [
	// 				{
	// 					url: "http://localhost:5000",
	// 					description: "Local Development Server",
	// 				},
	// 			],
	// 			tags: [
	// 				{ name: "General", description: "System health and sync" },
	// 				{
	// 					name: "*Arr Integration",
	// 					description: "Commands for Radarr, Sonarr, Lidarr",
	// 				},
	// 				{
	// 					name: "Telegram",
	// 					description: "MTProto auth and channel scraping",
	// 				},
	// 				{
	// 					name: "Alternative Sources",
	// 					description: "Internet Archive & Open Directories",
	// 				},
	// 				{
	// 					name: "Settings",
	// 					description: "Database and worker configuration",
	// 				},
	// 			],
	// 			// components: {
	// 			// 	securitySchemes: {
	// 			// 		ApiKeyAuth: {
	// 			// 			type: "apiKey",
	// 			// 			in: "header",
	// 			// 			name: "X-Api-Key",
	// 			// 		},
	// 			// 	},
	// 			// },
	// 		},
	// 	}),
	// )

	.use(
		staticPlugin({
			assets: join(import.meta.dir, "../client"),
			prefix: "",
			fallback: "index.html",
		}),
	)
	// .get("/", () => file("../client/index.html"), {
	// 	detail: {
	// 		hide: true,
	// 	},
	// })

	.get(
		"/api/v1",
		() => {
			return { success: true, message: "Eziarr API is Running" };
		},
		{
			response: t.Object({
				success: t.Boolean(),
				message: t.String(),
			}),
			detail: {
				summary: "API Health Check",
				description: "Simple endpoint to verify that the API is up and running",
				tags: ["General"],
			},
		},
	)

	.get(
		"/api/v1/missing",
		async () => {
			const missingItems = getItems();

			const [radarrQ, sonarrQ, lidarrQ] = await Promise.all([
				fetchQueue("radarr", "movieId"),
				fetchQueue("sonarr", "episodeId"),
				fetchQueue("lidarr", "albumId"),
			]);

			const queueItems = [...radarrQ, ...sonarrQ, ...lidarrQ];

			return { success: true, missing: missingItems, queue: queueItems };
		},
		{
			response: t.Object({
				success: t.Boolean(),
				missing: t.Array(
					t.Object({
						id: t.String(),
						serviceId: t.Integer(),
						title: t.String(),
						seriesTitle: t.Optional(t.Any()),
						type: t.Union([
							t.Literal("movie"),
							t.Literal("episode"),
							t.Literal("album"),
						]),
						service: t.Union([
							t.Literal("radarr"),
							t.Literal("sonarr"),
							t.Literal("lidarr"),
						]),
						releaseDate: t.Optional(t.Any()),
						posterUrl: t.Optional(t.Any()),
						status: t.String(),
					}),
				),
				queue: t.Array(
					t.Object({
						service: t.Union([
							t.Literal("radarr"),
							t.Literal("sonarr"),
							t.Literal("lidarr"),
						]),
						serviceId: t.Integer(),
						status: t.String(),
						trackStatus: t.String(),
						title: t.String(),
						quality: t.Optional(t.String()),
						indexer: t.Optional(t.String()),
						timeleft: t.Optional(t.String()),
					}),
				),
			}),
			detail: {
				summary: "Get Missing Items and Current Queue",
				description:
					"Fetches the list of missing movies/episodes/albums from the database along with their details, as well as the current download queue from Radarr/Sonarr/Lidarr to show active downloads.",
				tags: ["*Arr Integration"],
			},
		},
	)

	.post(
		"/api/v1/search",
		async ({ body: { service, id } }) => {
			const SERVICES = getServicesConfig();
			const config = SERVICES[service];

			if (!config) {
				return { success: false, message: "Invalid service" };
			}

			if (!config.url || !config.apiKey) {
				logger.warn(
					`[SERVER] Cancelling search because ${service} is not configured.`,
				);
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
		{
			body: t.Object({
				service: t.Union([
					t.Literal("radarr"),
					t.Literal("sonarr"),
					t.Literal("lidarr"),
				]),
				id: t.Union([t.String(), t.Number()]),
			}),
			response: t.Object({ success: t.Boolean(), message: t.String() }),
			detail: {
				summary: "Trigger Search for an Item",
				description:
					"Manually trigger a search in Radarr/Sonarr/Lidarr for a specific movie/episode/album by its service ID. This is useful for testing or forcing a re-search outside of the regular intervals.",
				tags: ["*Arr Integration"],
			},
		},
	)

	.post(
		"/api/v1/deepsearch",
		async ({ body: { type, query } }) => {
			const SERVICES = getServicesConfig();
			if (!SERVICES.prowlarr.url || !SERVICES.prowlarr.apiKey) {
				logger.warn(
					"[WORKER] Deepsearch cancelled because it is not configured",
				);
				return { success: false, torrents: [] };
			}

			// Map Service Types to Prowlarr Categories
			// 2000 = Movies, 5000 = TV, 3000 = Audio
			const categories =
				type === "movie" ? [2000] : type === "episode" ? [5000] : [3000];

			{
				const res = await axios.get(`${SERVICES.prowlarr.url}/api/v1/search`, {
					params: { query, categories: categories.join(","), type: "search" },
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
		{
			body: t.Object({
				type: t.Union([
					t.Literal("movie"),
					t.Literal("episode"),
					t.Literal("album"),
				]),
				query: t.String(),
			}),
			response: { success: t.Boolean(), torrents: t.Array() },
			detail: {
				summary: "Perform Deep Search via Prowlarr",
				description:
					"Use Prowlarr to perform a deep search across all indexers for a specific movie, episode or album. This can help find releases that Radarr/Sonarr might have missed. The results include metadata and download links for potential matches.",
				tags: ["*Arr Integration"],
			},
		},
	)

	.post(
		"/api/v1/forcegrab",
		async ({ body: { service, serviceId, title, downloadUrl } }) => {
			const SERVICES = getServicesConfig();
			const config = SERVICES[service];

			if (!config) {
				return { success: false, message: "Invalid service" };
			}

			if (!config.url || !config.apiKey) {
				logger.warn(
					`[SERVER] Cancelling force grab because ${service} is not configured.`,
				);
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
			if (!res.data[0].rejected)
				return { success: true, message: "Grabbed successfully" };

			const rejections = res.data[0].rejections.join(" ").toLowerCase();
			logger.warn(`[SERVER] ⚠️ [${service}] Grab Rejected: ${rejections}`);

			let actionsTaken = false;
			if (
				rejections.includes("profile") ||
				rejections.includes("cutoff") ||
				rejections.includes("wanted")
			) {
				logger.info(`[SERVER] 🔄 [${service}] Switching Profile to "Any"...`);

				const profilesRes = await axios.get(
					`${config.url}/api/v3/qualityprofile`,
					{ headers: { "X-Api-Key": config.apiKey }, timeout: 30000 },
				);
				const anyProfile =
					profilesRes.data.find((p) => p.name.toLowerCase() === "any") ||
					profilesRes.data[0];

				let endpoint = "";
				let targetId = sid;

				if (service === "radarr") {
					endpoint = "/api/v3/movie";
				} else if (service === "sonarr") {
					const epRes = await axios.get(`${config.url}/api/v3/episode/${sid}`, {
						headers: { "X-Api-Key": config.apiKey },
						timeout: 30000,
					});
					targetId = epRes.data.seriesId;
					endpoint = "/api/v3/series";
				} else if (service === "lidarr") {
					endpoint = "/api/v1/album";
				}

				const itemRes = await axios.get(
					`${config.url}${endpoint}/${targetId}`,
					{ headers: { "X-Api-Key": config.apiKey }, timeout: 30000 },
				);
				const item = itemRes.data;

				if (item.qualityProfileId !== anyProfile.id) {
					item.qualityProfileId = anyProfile.id;
					await axios.put(`${config.url}${endpoint}/${item.id}`, item, {
						headers: { "X-Api-Key": config.apiKey },
						timeout: 30000,
					});
					actionsTaken = true;
					logger.info(
						`[SERVER] 🔄 [${service}] Profile switched for "${item.title}"`,
					);
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

				res = await pushRelease();
				if (!res.data[0].rejected) {
					return {
						success: true,
						message: "Grabbed! (Overrode Profile/Queue)",
					};
				} else {
					return {
						success: false,
						message: `Still rejected: ${res.data[0].rejections[0]}`,
					};
				}
			}

			return { success: false, message: `Rejected: ${rejections}` };
		},
		{
			body: t.Object({
				service: t.Union([
					t.Literal("radarr"),
					t.Literal("sonarr"),
					t.Literal("lidarr"),
				]),
				serviceId: t.Union([t.String(), t.Number()]),
				title: t.String(),
				downloadUrl: t.String(),
			}),
			response: t.Object({ success: t.Boolean(), message: t.String() }),
			detail: {
				summary: "Force Grab an Item with Fixes",
				description: `Attempt to grab a movie/episode/album via Prowlarr. If the grab is rejected due to profile or queue issues, automatically attempt to fix those issues (switch to "Any" profile, remove blocking queue items) and retry the grab once. Returns the final result of the grab attempt along with any actions taken.`,
				tags: ["*Arr Integration"],
			},
		},
	)

	.post(
		"/api/v1/unmonitor",
		async ({ body: { service, serviceId } }) => {
			const SERVICES = getServicesConfig();
			const config = SERVICES[service];

			if (!config) {
				return { success: false, message: "Invalid service" };
			}

			if (!config.url || !config.apiKey) {
				logger.warn(
					`[SERVER] Cancelling unmonitor because ${service} is not configured.`,
				);
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

			deleteItem(`${service}-${sid}`);

			return { success: true, message: `Unmonitored ${service}-${sid}` };
		},
		{
			body: t.Object({
				service: t.Union([
					t.Literal("radarr"),
					t.Literal("sonarr"),
					t.Literal("lidarr"),
				]),
				serviceId: t.Union([t.String(), t.Number()]),
			}),
			response: t.Object({ success: t.Boolean(), message: t.String() }),
			detail: {
				summary: "Unmonitor an Item",
				description:
					"Stop monitoring a movie/episode/album in Radarr/Sonarr/Lidarr by setting monitored=false. This will remove it from the missing list and prevent future monitoring.",
				tags: ["*Arr Integration"],
			},
		},
	)

	.get(
		"/api/v1/settings",
		() => {
			const allSettings = getAllSettings();
			return { success: true, settings: allSettings };
		},
		{
			response: t.Object({
				success: t.Boolean(),
				settings: t.Record(t.String(), t.Any()),
			}),
			detail: {
				summary: "Get All Settings",
				description:
					"Retrieve all current settings and their values for the application.",
				tags: ["Settings"],
			},
		},
	)

	.post(
		"/api/v1/settings",
		({ body: { key, value } }) => {
			setSetting(key, value);
			return { success: true, message: "Setting updated" };
		},
		{
			body: t.Object({
				key: t.String(),
				value: t.Any(),
			}),
			response: t.Object({
				success: t.Boolean(),
				message: t.String(),
			}),
			detail: {
				summary: "Update a Setting",
				description:
					"Update a single setting by key. The value should be a string, and it's up to the client to ensure correct formatting (e.g. numbers, booleans). Returns the saved key-value pair.",
				tags: ["Settings"],
			},
		},
	)

	.post(
		"/api/v1/settings/batch",
		({ body }) => {
			for (const [key, value] of Object.entries(body)) {
				setSetting(key, value);
			}
			return { success: true, message: "Settings updated" };
		},
		{
			body: t.Object({
				syncEnabled: t.Boolean(),
				hunterEnabled: t.Boolean(),
				syncInterval: t.Number(),
				hunterInterval: t.Number(),
				radarrUrl: t.Optional(t.String()),
				radarrApiKey: t.Optional(t.String()),
				sonarrUrl: t.Optional(t.String()),
				sonarrApiKey: t.Optional(t.String()),
				lidarrUrl: t.Optional(t.String()),
				lidarrApiKey: t.Optional(t.String()),
				prowlarrUrl: t.Optional(t.String()),
				prowlarrApiKey: t.Optional(t.String()),
				telegramApiId: t.Optional(t.String()),
				telegramApiHash: t.Optional(t.String()),
				pathMapDocker: t.Optional(t.String()),
				pathMapRemote: t.Optional(t.String()),
				telegramTempHash: t.Optional(t.String()),
				telegramTempPhone: t.Optional(t.String()),
				telegramSession: t.Optional(t.String()),
			}),
			response: t.Object({ success: t.Boolean(), message: t.String() }),
			detail: {
				summary: "Batch Update Settings",
				description:
					"Update multiple settings at once by providing an object of key-value pairs. This is more efficient for saving multiple settings in one request. Returns success status.",
				tags: ["Settings"],
			},
		},
	)

	.get(
		"/api/v1/system/status",
		() => {
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
		{
			response: t.Object({
				success: t.Boolean(),
				isSetup: t.Boolean(),
				features: t.Object({
					radarr: t.Boolean(),
					sonarr: t.Boolean(),
					lidarr: t.Boolean(),
					prowlarr: t.Boolean(),
					telegram: t.Boolean(),
				}),
			}),
			detail: {
				summary: "Get System Status",
				description: "Retrieve status of services for the application.",
				tags: ["Settings"],
			},
		},
	)

	.post(
		"/api/v1/system/test",
		async ({ body: { service, url, apiKey } }) => {
			const cleanUrl = url.replace(/\/$/, "");

			const apiVer =
				service === "lidarr" || service === "prowlarr" ? "v1" : "v3";

			await axios.get(`${cleanUrl}/api/${apiVer}/system/status`, {
				headers: { "X-Api-Key": apiKey },
				timeout: 5000,
			});
			return { success: true, message: "Test successful" };
		},
		{
			body: t.Object({
				service: t.String(),
				url: t.String(),
				apiKey: t.String(),
			}),
			response: t.Object({
				success: t.Boolean(),
				message: t.String(),
			}),
			detail: {
				summary: "Test Service Connection",
				description:
					"Tests unsaved credentials against an *Arr service's status endpoint.",
				tags: ["Settings"],
			},
		},
	)

	.get(
		"/api/v1/telegram/status",
		async () => {
			const client = await getTelegramClient();
			if (!client) return { success: false, connected: false, channels: [] };

			const connected = await client.checkAuthorization();
			let simpleChannels = [];

			if (connected) {
				const dialogs = await client.getDialogs({ limit: 150 });

				simpleChannels = dialogs
					.filter((d) => d.isChannel)
					.map((d) => ({
						id: d.id.toString(),
						title: d.title || "Unknown Channel",
						username: d.entity?.username || null,
					}));

				simpleChannels.sort((a, b) => a.title.localeCompare(b.title));
			}

			return { success: true, connected, channels: simpleChannels };
		},
		{
			response: t.Object({
				success: t.Boolean(),
				connected: t.Boolean(),
				channels: t.Array(
					t.Object({
						id: t.String(),
						title: t.String(),
						username: t.Optional(t.Any()),
					}),
				),
			}),
			detail: {
				summary: "Check Telegram Connection Status",
				description:
					"Check if the Telegram client is connected and authorized, and retrieve a list of channels the client has access to. This can be used to verify Telegram integration and select channels for searching or importing.",
				tags: ["Telegram"],
			},
		},
	)

	.post(
		"/api/v1/telegram/auth/send-code",
		async ({ body: { phoneNumber } }) => {
			await sendLoginCode(phoneNumber);
			return { success: true, message: "Code sent successfully" };
		},
		{
			body: t.Object({ phoneNumber: t.String() }),
			response: t.Object({ success: t.Boolean(), message: t.String() }),
			detail: {
				summary: "Send Telegram Login Code",
				description:
					"Initiate the Telegram login process by sending a login code to the specified phone number. This is the first step in authenticating the Telegram client.",
				tags: ["Telegram"],
			},
		},
	)

	.post(
		"/api/v1/telegram/auth/login",
		async ({ body: { code, password } }) => {
			const res = await completeLogin(code, password);

			if (res.success) {
				return { success: true, message: "Login successful" };
			} else {
				return { success: false, message: res.message || "Login failed" };
			}
		},
		{
			body: t.Object({
				code: t.String(),
				password: t.Optional(t.String()),
			}),
			response: t.Object({ success: t.Boolean(), message: t.String() }),
			detail: {
				summary: "Complete Telegram Login",
				description:
					"Complete the Telegram login process by providing the code received on the phone and, if required, the two-factor authentication password. This will authenticate the Telegram client for future API interactions.",
				tags: ["Telegram"],
			},
		},
	)

	.post(
		"/api/v1/telegram/search",
		async ({ body: { channel, query } }) => {
			const files = await searchChannel(channel, query);
			return { success: true, files };
		},
		{
			body: t.Object({
				channel: t.String(),
				query: t.String(),
			}),
			response: t.Object({
				success: t.Boolean(),
				files: t.Array(
					t.Object({
						id: t.Number(),
						channel: t.String(),
						filename: t.String(),
						size: t.Number(),
						date: t.Number(),
						messageText: t.String(),
					}),
				),
			}),
			detail: {
				summary: "Search for Media in a Telegram Channel",
				description:
					"Search a specific Telegram channel for messages containing media (documents) that match the query. Returns an array of matching messages with metadata about the media files, which can then be imported.",
				tags: ["Telegram"],
			},
		},
	)

	.post(
		"/api/v1/telegram/import",
		async ({ body: { service, serviceId, channel, messageId, filename } }) => {
			const SERVICES = getServicesConfig();
			const config = SERVICES[service];

			if (!config) return { success: false, message: "Invalid service" };

			if (!config.url || !config.apiKey) {
				logger.error(`[SERVER] ${service} is not configured.`);
				return {
					success: false,
					message: `${service} is not configured.`,
				};
			}

			const sid = coerceNumericId(serviceId, "serviceId");

			// 1. Download from Telegram (Async - don't await if you want to return immediately)
			// ideally, we should use a queue/worker for this. For now, we await.
			logger.info(`[SERVER] 📥 [Telegram] Starting import for ${filename}...`);
			const { path, filePath } = await downloadMedia(
				channel,
				messageId,
				filename,
			);
			logger.info(
				`[SERVER] 📥 [Telegram] Download completed. Path: ${path}, Filepath: ${filePath}`,
			);

			const commandName =
				service === "radarr"
					? "DownloadedMoviesScan"
					: service === "sonarr"
						? "DownloadedEpisodesScan"
						: "DownloadedAlbumsScan";
			const arrPath = translatePath(filePath);
			logger.info(
				`[SERVER] 📥 [Path Map] Local: ${filePath} -> Remote: ${arrPath}`,
			);

			const commandPayload = {
				name: commandName,
				path: arrPath,
				importMode: "Move",
			};

			if (service === "radarr") commandPayload.movieId = sid;

			// Note for Sonarr: 'DownloadedEpisodesScan' does NOT accept 'episodeId'.
			// It relies entirely on the filename containing "S01E01".
			// If the Telegram file doesn't have S01E01, Sonarr will likely reject it
			// and you will see it in Sonarr > Activity > Queue (Manual Import needed).
			const res = await axios.post(
				`${config.url}/api/v3/command`,
				commandPayload,
				{
					headers: { "X-Api-Key": config.apiKey },
					timeout: 30000,
				},
			);

			console.log(res.data);

			return {
				success: true,
				message: `Sent to ${service} for import!`,
			};
		},
		{
			body: t.Object({
				service: t.Union([
					t.Literal("radarr"),
					t.Literal("sonarr"),
					t.Literal("lidarr"),
				]),
				serviceId: t.Union([t.String(), t.Number()]),
				channel: t.String(),
				messageId: t.Number(),
				filename: t.String(),
			}),
			response: t.Object({ success: t.Boolean(), message: t.String() }),
			detail: {
				summary: "Import Media from Telegram to Radarr/Sonarr/Lidarr",
				description:
					"Download a media file from a Telegram message and send it to Radarr/Sonarr for import. The Telegram message is identified by its channel and message ID. Note: Sonarr relies on filename parsing, so ensure the file is named with SxxExx format for episodes.",
				tags: ["Telegram", "*Arr Integration"],
			},
		},
	)

	.post(
		"/api/v1/ia/search",
		async ({ body: { query } }) => {
			const files = await searchInternetArchive(query);
			return { success: true, files };
		},
		{
			body: t.Object({
				query: t.String(),
			}),
			response: t.Object({
				success: t.Boolean(),
				files: t.Array(
					t.Object({
						id: t.String(),
						title: t.String(),
						year: t.Optional(t.Any()), // Sometimes year is missing
						downloads: t.Number(),
						detailsUrl: t.String(),
					}),
				),
			}),
			detail: {
				summary: "Search Internet Archive",
				description:
					"Search for items on the Internet Archive by a query string. Returns a list of matching items with basic metadata and a URL to view details on the IA website.",
				tags: ["Alternative Sources"],
			},
		},
	)

	.get(
		"/api/v1/ia/files/:identifier",
		async ({ params: { identifier } }) => {
			const filesInside = await getInternetArchiveFiles(identifier);
			return { success: true, filesInside };
		},
		{
			params: t.Object({
				identifier: t.String(),
			}),
			response: t.Object({
				success: t.Boolean(),
				filesInside: t.Array(
					t.Object({
						downloadUrl: t.String(),
						filename: t.String(),
						size: t.String(),
						format: t.String(),
					}),
				),
			}),
			detail: {
				summary: "Get Files from Internet Archive",
				description:
					"Retrieve a list of files associated with a specific item on the Internet Archive, identified by its unique identifier. This is typically used after searching for an item to see what media files are available for download.",
				tags: ["Alternative Sources"],
			},
		},
	)

	.post(
		"/api/v1/opendir/scan",
		async ({ body: { url } }) => {
			const files = await scanOpenDir(url);
			return { success: true, files };
		},
		{
			body: t.Object({
				url: t.String(),
			}),
			response: t.Object({
				success: t.Boolean(),
				files: t.Array(
					t.Object({
						downloadUrl: t.String(),
						filename: t.String(),
						ext: t.String(),
					}),
				),
			}),
			detail: {
				summary: "Scan an Open Directory",
				description: `Given the URL of an open directory (a web page that lists files, often on a public server), scan the page and return a list of media files available for download. This can be used to find direct download links for movies or episodes that can then be sent to Radarr/Sonarr.`,
				tags: ["Alternative Sources"],
			},
		},
	)

	.post(
		"/api/v1/import/http",
		async ({ body: { service, serviceId, url, filename } }) => {
			const SERVICES = getServicesConfig();
			const config = SERVICES[service];

			if (!config) {
				return { success: false, message: "Invalid service" };
			}

			if (!config.url || !config.apiKey) {
				logger.warn(
					`SERVER] Cancelling web import because ${service} is not configured.`,
				);
				return {
					success: false,
					message: `${service} is not configured.`,
				};
			}

			const sid = coerceNumericId(serviceId, "serviceId");

			logger.info(`[SERVER] 📥 [HTTP] Starting download: ${filename}`);
			const { path: downloadPath } = await downloadHttpFile(url, filename);

			const commandName =
				service === "radarr"
					? "DownloadedMoviesScan"
					: service === "sonarr"
						? "DownloadedEpisodesScan"
						: "DownloadedAlbumsScan";
			const arrPath = translatePath(downloadPath);

			logger.info(
				`[SERVER] 📥 [Path Map] Local: ${downloadPath} -> Remote: ${arrPath}`,
			);

			const commandPayload = {
				name: commandName,
				path: arrPath,
				importMode: "Move",
			};

			if (service === "radarr") commandPayload.movieId = sid;

			await axios.post(`${config.url}/api/v3/command`, commandPayload, {
				headers: { "X-Api-Key": config.apiKey },
				timeout: 30000,
			});

			return {
				success: true,
				message: `Downloaded & Sent to ${service} for import!`,
			};
		},
		{
			body: t.Object({
				service: t.Union([
					t.Literal("radarr"),
					t.Literal("sonarr"),
					t.Literal("lidarr"),
				]),
				serviceId: t.Union([t.String(), t.Number()]),
				url: t.String(),
				filename: t.String(),
			}),
			response: t.Object({ success: t.Boolean(), message: t.String() }),
			detail: {
				summary: "Import Media from HTTP URL to Radarr/Sonarr/Lidarr",
				description:
					"Download a media file from an HTTP URL and send it to Radarr/Sonarr/Lidarr for import. This is useful for importing files from open directories or direct links. Note: Sonarr relies on filename parsing, so ensure the file is named with SxxExx format for episodes.",
				tags: ["Alternative Sources", "*Arr Integration"],
			},
		},
	);

try {
	app.listen(process.env.PORT || 5000);
	process.env.NODE_ENV === "development" &&
		logger.info("[SERVER] 📘 Eziarr OpenAPI UI enabled at /openapi");
	logger.info(
		`[SERVER] Eziarr is running at ${app.server?.hostname}:${app.server?.port}`,
	);
} catch (err) {
	logger.error("[SERVER] 💥 Failed to start server: ", err);
	process.exit(1);
}
