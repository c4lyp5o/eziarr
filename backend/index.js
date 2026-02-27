import { Elysia, NotFoundError, file } from "elysia";
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
	.onError(({ code, error, set }) => {
		if (code === "NOT_FOUND") {
			set.status = 404;
			return { success: false, error: "API Route Not Found" };
		}

		set.status = 500;
		console.error(`[${code}] Server Error`, error);
		return { success: false, error: error.message || "Internal Server Error" };
	})

	.use(cors())

	.use(
		staticPlugin({
			assets: "../client",
			prefix: "",
			fallback: "index.html",
		}),
	)
	.get("/", () => file("../client/index.html"))

	.get("/api/v1", () => {
		return { status: "ok", message: "Eziarr API is Running" };
	})

	.get("/api/v1/missing", async () => {
		// Return data mapped correctly for frontend
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
	})

	.post("/api/v1/unmonitor", async ({ body }) => {
		const { service, serviceId } = body;
		const config = SERVICES[service];

		try {
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

			// Remove from our local DB so it disappears instantly
			// (You need to import 'deleteItem' from db.ts - see below)
			deleteItem(`radarr-${serviceId}`); // Note: ID handling needs to match your DB keys

			return { success: true };
		} catch (err) {
			console.error(`Failed to unmonitor ${service} item ${serviceId}`, err);
			return { success: false, error: "Update failed" };
		}
	})

	.post("/api/v1/search", async ({ body }) => {
		const { service, id } = body;
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

		try {
			await axios.post(`${baseUrl}${endpoint}`, payload, {
				headers: { "X-Api-Key": apiKey },
			});
			return {
				success: true,
				message: `Search triggered for ${service} item ${id}`,
			};
		} catch (error) {
			console.error(`Error searching ${service}:`, error);
			return { success: false, error: "Failed to trigger search" };
		}
	})

	.post("/api/v1/deepsearch", async ({ body }) => {
		const { type, query } = body;

		// Map Service Types to Prowlarr Categories
		// 2000 = Movies, 5000 = TV, 3000 = Audio
		const categories =
			type === "movie" ? [2000] : type === "episode" ? [5000] : [3000];

		try {
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
					age: r.age, // days old
					downloadUrl: r.downloadUrl || r.magnetUrl,
					guid: r.guid,
				}))
				.sort((a, b) => b.seeders - a.seeders); // Sort by seeds
		} catch (err) {
			console.error("Prowlarr Search Error", err);
			return [];
		}
	})

	.post("/api/v1/forcegrab", async ({ body }) => {
		const { service, serviceId, title, downloadUrl } = body;
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

		try {
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
					} catch (e) {
						console.error(`[${service}] Failed to delete queue item`, e);
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
		} catch (err) {
			console.error(`Force Grab failed for ${service}`, err);
			return { success: false, message: "API Error during force grab" };
		}
	})

	.get("/api/v1/settings", () => {
		return getAllSettings();
	})

	.post("/api/v1/settings", ({ body }) => {
		const { key, value } = body;
		setSetting(key, value);
		return { success: true, saved: { [key]: value } };
	})

	.post("/api/v1/settings/batch", ({ body }) => {
		for (const [key, value] of Object.entries(body)) {
			setSetting(key, value);
		}
		return { success: true };
	})

	.get("/api/v1/telegram/status", async () => {
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
	})

	.post("/api/v1/telegram/auth/send-code", async ({ body }) => {
		return await sendLoginCode(body.phone);
	})

	.post("/api/v1/telegram/auth/login", async ({ body }) => {
		return await completeLogin(body.code, body.password);
	})

	.post("/api/v1/telegram/search", async ({ body }) => {
		const results = await searchChannel(body.channel, body.query);
		return results;
	})

	.post("/api/v1/telegram/import", async ({ body }) => {
		const { service, serviceId, channel, messageId, filename } = body;
		if (!service || !serviceId || !channel || !messageId || !filename) {
			return { success: false, error: "Missing required fields" };
		}

		const config = SERVICES[service];
		if (!config) {
			return { success: false, error: "Invalid service" };
		}

		// 1. Download from Telegram (Async - don't await if you want to return immediately)
		// ideally, we should use a queue/worker for this. For now, we await.
		try {
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
		} catch (err) {
			console.error("Telegram Import Failed", err);
			const errorMessage =
				err.response?.data?.message || err.response?.data || err.message;
			return { success: false, error: errorMessage };
		}
	})

	.post("/api/v1/ia/search", async ({ body }) => {
		return await searchInternetArchive(body.query);
	})

	.get("/api/v1/ia/files/:identifier", async ({ params: { identifier } }) => {
		return await getArchiveFiles(identifier);
	})

	.post("/api/v1/opendir/scan", async ({ body }) => {
		return await scanOpenDir(body.url);
	})

	.post("/api/v1/import/http", async ({ body }) => {
		const { service, serviceId, url, filename } = body;
		const config = SERVICES[service];

		try {
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
		} catch (err) {
			console.error("HTTP Import Failed", err);
			const errorMessage =
				err.response?.data?.message || err.response?.data || err.message;
			return { success: false, error: errorMessage };
		}
	})

	.all("/api/*", () => {
		throw new NotFoundError();
	});

if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "dev") {
	app.use(
		openapi({
			info: { title: "Eziarr API", version: "1.0.0" },
		}),
	);
	console.log("📘 OpenAPI UI enabled at /openapi");
}

try {
	app.listen(process.env.PORT || 5000);
	console.log(`🦊 Eziarr at ${app.server?.hostname}:${app.server?.port}`);
} catch (err) {
	console.error(err);
	process.exit(1);
}
