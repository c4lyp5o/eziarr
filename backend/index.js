import { Elysia, t, NotFoundError, file } from "elysia";
import { cors } from "@elysiajs/cors";
import { staticPlugin } from "@elysiajs/static";
import { openapi } from "@elysiajs/openapi";
import axios from "axios";
import {
	getTelegramClient,
	sendLoginCode,
	completeLogin,
	searchChannel,
	downloadMedia,
} from "./telegram";
import { searchInternetArchive, getArchiveFiles } from "./ia";
import { scanOpenDir } from "./opendir";
import { downloadHttpFile } from "./downloader";
import { getItems, getAllSettings, setSetting } from "./db";
import { SERVICES, fetchQueue, translatePath } from "./utils";

const app = new Elysia()
	.onError(
		({ code, error, set }) => {
			if (code === "NOT_FOUND") {
				set.status = 404;
				return { success: false, error: "API Route Not Found" };
			}
			if (code === "VALIDATION") {
				set.status = 400;
				return { success: false, error: "Bad request data" };
			}

			set.status = 500;
			console.error(`[${code}] Server Error`, error);
			const msg =
				process.env.NODE_ENV === "development" || process.env.NODE_ENV === "dev"
					? error.message
					: "Internal Server Error";
			return { success: false, error: msg };
		},
		{ detail: { hide: true } },
	)

	.use(cors())

	.use(
		openapi({
			enabled:
				process.env.NODE_ENV === "development" ||
				process.env.NODE_ENV === "dev",
			exclude: {
				paths: ["/", "/*", ""],
			},
			documentation: {
				info: {
					title: "Eziarr API 🍿",
					version: "1.0.0",
					description:
						"The ultimate backend for managing missing *Arr media, scraping Telegram, and deep-searching the high seas.",
					contact: {
						name: "Eziarr Dev Team",
						url: "https://github.com/c4lyp5o/eziarr",
						email: "calypso[at]calypsocloud.one",
					},
					license: {
						name: "MIT",
						url: "https://opensource.org/licenses/MIT",
					},
				},
				servers: [
					{
						url: "http://localhost:5000",
						description: "Local Development Server",
					},
				],
				tags: [
					{ name: "General", description: "System health and sync" },
					{
						name: "*Arr Integration",
						description: "Commands for Radarr, Sonarr, Lidarr",
					},
					{
						name: "Telegram",
						description: "MTProto auth and channel scraping",
					},
					{
						name: "Alternative Sources",
						description: "Internet Archive & Open Directories",
					},
					{
						name: "Settings",
						description: "Database and worker configuration",
					},
				],
				// components: {
				// 	securitySchemes: {
				// 		ApiKeyAuth: {
				// 			type: "apiKey",
				// 			in: "header",
				// 			name: "X-Api-Key",
				// 		},
				// 	},
				// },
			},
		}),
	)

	.use(
		staticPlugin({
			assets: "../client",
			prefix: "",
			fallback: "index.html",
		}),
	)
	.get("/", () => file("../client/index.html"), {
		detail: {
			hide: true,
		},
	})

	.get(
		"/api/v1",
		() => {
			return { status: "ok", message: "Eziarr API is Running" };
		},
		{
			response: t.Object({
				status: t.String(),
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
			const missingItems = getItems()
				.sort((a, b) => {
					const dateA = new Date(b.release_date || 0).getTime();
					const dateB = new Date(a.release_date || 0).getTime();
					return dateB - dateA;
				})
				.map((row) => ({
					id: row.id,
					serviceId: row.service_id,
					title: row.title,
					seriesTitle: row.series_title,
					type: row.type,
					service: row.service,
					releaseDate: row.release_date,
					posterUrl: row.poster_url,
					status: row.status,
				}));

			const [radarrQ, sonarrQ, lidarrQ] = await Promise.all([
				fetchQueue("radarr", "movieId"),
				fetchQueue("sonarr", "episodeId"),
				fetchQueue("lidarr", "albumId"),
			]);

			const queueItems = [...radarrQ, ...sonarrQ, ...lidarrQ];

			return { missing: missingItems, queue: queueItems };
		},
		{
			response: t.Object({
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
						title: t.String(),
						indexer: t.String(),
						quality: t.String(),
						status: t.String(),
						trackStatus: t.String(),
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
		"/api/v1/unmonitor",
		async ({ body: { service, serviceId } }) => {
			const config = SERVICES[service];

			if (service === "radarr") {
				// 1. Get current movie data first (Radarr requires the full object to update)
				const getRes = await axios.get(
					`${config.url}/api/v3/movie/${serviceId}`,
					{
						headers: { "X-Api-Key": config.apiKey },
					},
				);
				const movie = getRes.data;

				// 2. Set monitored = false and update
				movie.monitored = false;
				await axios.put(`${config.url}/api/v3/movie/${serviceId}`, movie, {
					headers: { "X-Api-Key": config.apiKey },
				});
			} else if (service === "sonarr") {
				// For Sonarr, we are usually unmonitoring a specific EPISODE
				const getRes = await axios.get(
					`${config.url}/api/v3/episode/${serviceId}`,
					{
						headers: { "X-Api-Key": config.apiKey },
					},
				);
				const episode = getRes.data;

				episode.monitored = false;
				await axios.put(`${config.url}/api/v3/episode/${serviceId}`, episode, {
					headers: { "X-Api-Key": config.apiKey },
				});
			} else if (service === "lidarr") {
				// Lidarr Album unmonitor
				const getRes = await axios.get(
					`${config.url}/api/v1/album/${serviceId}`,
					{
						headers: { "X-Api-Key": config.apiKey },
					},
				);
				const album = getRes.data;

				album.monitored = false;
				await axios.put(`${config.url}/api/v1/album/${serviceId}`, album, {
					headers: { "X-Api-Key": config.apiKey },
				});
			}

			deleteItem(`${service}-${serviceId}`);

			return { success: true };
		},
		{
			body: t.Object({
				service: t.Union([
					t.Literal("radarr"),
					t.Literal("sonarr"),
					t.Literal("lidarr"),
				]),
				serviceId: t.String(),
			}),
			response: t.Object({ success: t.Boolean() }),
			detail: {
				summary: "Unmonitor an Item",
				description:
					"Stop monitoring a movie/episode/album in Radarr/Sonarr/Lidarr by setting monitored=false. This will remove it from the missing list and prevent future monitoring.",
				tags: ["*Arr Integration"],
			},
		},
	)

	.post(
		"/api/v1/search",
		async ({ body: { service, id } }) => {
			console.log(`Received search request for ${service} item with ID ${id}`);

			let endpoint = "";
			let payload = {};
			let apiKey = "";
			let baseUrl = "";

			if (service === "radarr") {
				baseUrl = SERVICES.radarr.url;
				apiKey = SERVICES.radarr.apiKey;
				endpoint = "/api/v3/command";
				payload = { name: "MoviesSearch", movieIds: [id] };
			} else if (service === "sonarr") {
				baseUrl = SERVICES.sonarr.url;
				apiKey = SERVICES.sonarr.apiKey;
				endpoint = "/api/v3/command";
				payload = { name: "EpisodeSearch", episodeIds: [id] };
			} else if (service === "lidarr") {
				baseUrl = SERVICES.lidarr.url;
				apiKey = SERVICES.lidarr.apiKey;
				endpoint = "/api/v1/command";
				payload = { name: "AlbumSearch", albumIds: [id] };
			}

			await axios.post(`${baseUrl}${endpoint}`, payload, {
				headers: { "X-Api-Key": apiKey },
			});
			return {
				success: true,
				message: `Search triggered for ${service} item ${id}`,
			};
		},
		{
			body: t.Object({
				service: t.Union([
					t.Literal("radarr"),
					t.Literal("sonarr"),
					t.Literal("lidarr"),
				]),
				id: t.String(),
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
			// Map Service Types to Prowlarr Categories
			// 2000 = Movies, 5000 = TV, 3000 = Audio
			const categories =
				type === "movie" ? [2000] : type === "episode" ? [5000] : [3000];

			{
				const res = await axios.get(`${SERVICES.prowlarr.url}/api/v1/search`, {
					params: { query, categories: categories.join(","), type: "search" },
					headers: { "X-Api-Key": SERVICES.prowlarr.apiKey },
				});

				// Return simplified results
				return res.data
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
			const config = SERVICES[service];

			const pushRelease = async () => {
				return axios.post(
					`${config.url}/api/v3/release/push`,
					{
						title: title,
						downloadUrl: downloadUrl,
						protocol: "Torrent",
						publishDate: new Date().toISOString(),
					},
					{ headers: { "X-Api-Key": config.apiKey } },
				);
			};

			// 1. Try Initial Grab
			let res = await pushRelease();
			if (!res.data[0].rejected)
				return { success: true, message: "Grabbed successfully" };

			const rejections = res.data[0].rejections.join(" ").toLowerCase();
			console.log(`[${service}] Grab Rejected: ${rejections}`);
			let actionsTaken = false;

			if (
				rejections.includes("profile") ||
				rejections.includes("cutoff") ||
				rejections.includes("wanted")
			) {
				console.log(`[${service}] Fix: Switching Profile to "Any"...`);

				// 1. Get "Any" Profile
				const profilesRes = await axios.get(
					`${config.url}/api/v3/qualityprofile`,
					{ headers: { "X-Api-Key": config.apiKey } },
				);
				const anyProfile =
					profilesRes.data.find((p) => p.name.toLowerCase() === "any") ||
					profilesRes.data[0];

				// 2. Determine Correct Endpoint & ID
				let endpoint = "";
				let targetId = serviceId;

				if (service === "radarr") {
					endpoint = "/api/v3/movie";
				} else if (service === "sonarr") {
					// FIX: If Sonarr, we have EpisodeID, but we must update the SERIES
					const epRes = await axios.get(
						`${config.url}/api/v3/episode/${serviceId}`,
						{ headers: { "X-Api-Key": config.apiKey } },
					);
					targetId = epRes.data.seriesId; // Get the parent Series ID
					endpoint = "/api/v3/series";
				}

				// 3. Get Item (Movie or Series) & Update
				const itemRes = await axios.get(
					`${config.url}${endpoint}/${targetId}`,
					{ headers: { "X-Api-Key": config.apiKey } },
				);
				const item = itemRes.data;

				if (item.qualityProfileId !== anyProfile.id) {
					item.qualityProfileId = anyProfile.id;
					await axios.put(`${config.url}${endpoint}/${item.id}`, item, {
						headers: { "X-Api-Key": config.apiKey },
					});
					actionsTaken = true;
					console.log(`[${service}] Profile switched for "${item.title}"`);
				}
			}

			if (
				rejections.includes("queue") ||
				rejections.includes("equal or higher preference")
			) {
				console.log(`[${service}] Fix: Removing blocking item from Queue...`);

				// Get Queue
				// Note: Lidarr uses v1, others v3. But queue endpoint is generally consistent in structure.
				const apiVer = service === "lidarr" ? "v1" : "v3";
				const queueRes = await axios.get(`${config.url}/api/${apiVer}/queue`, {
					headers: { "X-Api-Key": config.apiKey },
				});

				// Find item matching our Movie/Episode
				// Radarr uses 'movieId', Sonarr uses 'episodeId', Lidarr uses 'albumId'
				const idKey =
					service === "radarr"
						? "movieId"
						: service === "sonarr"
							? "episodeId"
							: "albumId";

				// Find ALL items in queue for this content (there might be multiple)
				const blockingItems = queueRes.data.records.filter(
					(q) => q[idKey] === serviceId,
				);

				for (const item of blockingItems) {
					try {
						// Delete from Queue AND Client (blacklist=false usually preferred for manual swaps, but blacklist=true prevents re-grab)
						// We use removeFromClient=true to stop the other download.
						await axios.delete(
							`${config.url}/api/${apiVer}/queue/${item.id}?removeFromClient=true&blocklist=true`,
							{
								headers: { "X-Api-Key": config.apiKey },
							},
						);
						console.log(`[${service}] Deleted queue item: ${item.id}`);
						actionsTaken = true;
					} catch (err) {
						console.error(`[${service}] Failed to delete queue item`, err);
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
				serviceId: t.String(),
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

	.get(
		"/api/v1/settings",
		() => {
			return getAllSettings();
		},
		{
			response: t.Record(t.String(), t.Any()),
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
			return { success: true, saved: { [key]: value } };
		},
		{
			body: t.Object({
				key: t.String(),
				value: t.Any(),
			}),
			response: t.Object({
				success: t.Boolean(),
				saved: t.Record(t.String(), t.String()),
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
			return { success: true };
		},
		{
			body: t.Record(t.String(), t.String()),
			response: t.Object({ success: t.Boolean() }),
			detail: {
				summary: "Batch Update Settings",
				description:
					"Update multiple settings at once by providing an object of key-value pairs. This is more efficient for saving multiple settings in one request. Returns success status.",
				tags: ["Settings"],
			},
		},
	)

	.get(
		"/api/v1/telegram/status",
		async () => {
			const client = await getTelegramClient();
			if (!client) return { connected: false, channels: [] };

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

			return { connected, channels: simpleChannels };
		},
		{
			response: t.Object({
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
			return await sendLoginCode(phoneNumber);
		},
		{
			body: t.Object({ phoneNumber: t.String() }),
			response: t.Object({ success: t.Boolean() }),
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
			return await completeLogin(code, password);
		},
		{
			body: t.Object({
				code: t.String(),
				password: t.String(),
			}),
			response: t.Object({ success: t.Boolean() }),
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
			const results = await searchChannel(channel, query);
			return results;
		},
		{
			body: t.Object({
				channel: t.String(),
				query: t.String(),
			}),
			response: t.Array(
				t.Object({
					id: t.Number(),
					channel: t.String(),
					filename: t.String(),
					size: t.Number(),
					date: t.Number(),
					messageText: t.String(),
				}),
			),
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
			const config = SERVICES[service];
			if (!config) {
				return { success: false, error: "Invalid service" };
			}

			// 1. Download from Telegram (Async - don't await if you want to return immediately)
			// ideally, we should use a queue/worker for this. For now, we await.
			console.log(`[Telegram] Starting import for ${filename}...`);
			const { path, filePath } = await downloadMedia(
				channel,
				messageId,
				filename,
			);
			console.log("[Telegram] Download completed", { path, filePath });

			const commandName =
				service === "radarr"
					? "DownloadedMoviesScan"
					: "DownloadedEpisodesScan";
			const arrPath = translatePath(filePath);
			console.log(`[Path Map] Local: ${filePath} -> Remote: ${arrPath}`);

			const commandPayload = {
				name: commandName,
				path: arrPath,
				importMode: "Move",
			};

			if (service === "radarr") commandPayload.movieId = serviceId;

			// Note for Sonarr: 'DownloadedEpisodesScan' does NOT accept 'episodeId'.
			// It relies entirely on the filename containing "S01E01".
			// If the Telegram file doesn't have S01E01, Sonarr will likely reject it
			// and you will see it in Sonarr > Activity > Queue (Manual Import needed).
			await axios.post(`${config.url}/api/v3/command`, commandPayload, {
				headers: { "X-Api-Key": config.apiKey },
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
				serviceId: t.String(),
				channel: t.String(),
				messageId: t.String(),
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
			return await searchInternetArchive(query);
		},
		{
			body: t.Object({
				query: t.String(),
			}),
			response: t.Array(
				t.Object({
					id: t.String(),
					title: t.String(),
					year: t.Optional(t.Any()), // Sometimes year is missing
					downloads: t.Number(),
					detailsUrl: t.String(),
				}),
			),
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
			return await getArchiveFiles(identifier);
		},
		{
			params: t.Object({
				identifier: t.String(),
			}),
			response: t.Array(
				t.Object({
					downloadUrl: t.String(),
					filename: t.String(),
					size: t.String(),
					format: t.String(),
				}),
			),
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
			return await scanOpenDir(url);
		},
		{
			body: t.Object({
				url: t.String(),
			}),
			response: t.Array(
				t.Object({
					downloadUrl: t.String(),
					filename: t.String(),
					ext: t.String(),
				}),
			),
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
			const config = SERVICES[service];

			console.log(`[HTTP] Starting download: ${filename}`);
			const { path: downloadPath } = await downloadHttpFile(url, filename);

			const commandName =
				service === "radarr"
					? "DownloadedMoviesScan"
					: "DownloadedEpisodesScan";
			const arrPath = translatePath(downloadPath);

			console.log(`[Path Map] Local: ${downloadPath} -> Remote: ${arrPath}`);

			const commandPayload = {
				name: commandName,
				path: arrPath,
				importMode: "Move",
			};

			if (service === "radarr") commandPayload.movieId = serviceId;

			await axios.post(`${config.url}/api/v3/command`, commandPayload, {
				headers: { "X-Api-Key": config.apiKey },
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
				serviceId: t.String(),
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
	)

	.all(
		"/api/*",
		() => {
			throw new NotFoundError();
		},
		{ detail: { hide: true } },
	);

try {
	app.listen(process.env.PORT || 5000);
	console.log("📘 OpenAPI UI enabled at /openapi");
	console.log(`🦊 Eziarr at ${app.server?.hostname}:${app.server?.port}`);
} catch (err) {
	console.error(err);
	process.exit(1);
}
