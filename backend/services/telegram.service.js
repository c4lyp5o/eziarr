import {
	getTelegramClient,
	sendLoginCode,
	completeLogin,
	searchChannel,
	listChannelIds,
} from "../telegram";
import { getAllServices, addToDownloadQueue } from "../db";
import { coerceNumericId } from "../utils";
import { arr } from "../arr";
import {
	compact,
	parseEpisode,
	parseYear,
	queryVariants,
	scoreName,
	titleOf,
} from "../match";
import { generalLogger as logger } from "../logger";
import { buildImportFilename } from "../import";

const CHANNEL_CONCURRENCY = 4; // channels searched at once
const MAX_QUERIES = 10; // Telegram searches per click; each is a round trip
const MAX_TITLES = 5;

/**
 * What the *Arr knows about a title beyond its display name: original and
 * alternate titles (a local film is often posted under its English name,
 * an anime under its romaji one), the year, and for an episode its number.
 * Null when the *Arr can't be asked; the search then uses the query alone.
 */
const titleContext = async (service, serviceId) => {
	const config = getAllServices()[service];
	if (!config?.url || !config?.apiKey) return null;
	const id = coerceNumericId(serviceId, "serviceId");
	const client = arr(config, service);
	try {
		if (service === "radarr") {
			const { data: movie } = await client.get(`/movie/${id}`);
			return {
				titles: [
					movie.title,
					movie.originalTitle,
					...(movie.alternateTitles ?? []).map((a) => a.title),
				],
				year: movie.year || null,
			};
		}
		if (service === "sonarr") {
			const { data: episode } = await client.get(`/episode/${id}`);
			const { data: series } = await client.get(`/series/${episode.seriesId}`);
			return {
				titles: [
					series.title,
					...(series.alternateTitles ?? []).map((a) => a.title),
				],
				episode: {
					season: episode.seasonNumber,
					episode: episode.episodeNumber,
				},
			};
		}
		if (service === "lidarr") {
			const { data: album } = await client.get(`/album/${id}`);
			return {
				titles: [
					`${album.artist?.artistName ?? ""} ${album.title}`,
					album.title,
				],
				year: parseYear(album.releaseDate),
			};
		}
	} catch (err) {
		logger.warn(
			`[TELEGRAM] Couldn't read alternate titles from ${service}: ${err.message}`,
		);
	}
	return null;
};

export const TelegramService = {
	getTelegramStatus: async () => {
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

	postTelegramSendCode: async ({ body: { phoneNumber } }) => {
		await sendLoginCode(phoneNumber);
		return { success: true, message: "Code sent successfully" };
	},

	postTelegramLogin: async ({ body: { code, password } }) => {
		const res = await completeLogin(code, password);

		if (res.success) {
			return { success: true, message: "Login successful" };
		} else {
			return { success: false, message: res.message || "Login failed" };
		}
	},

	/**
	 * Searches every channel (or just `channel`, when given) for the query as typed, the ways people tend to
	 * write it differently ("5 cm" / "5cm"), and the title's alternate names
	 * from the *Arr; then ranks every file by how well it fits.
	 */
	postTelegramSearch: async ({ body: { channel, query, service, serviceId } }) => {
		const known =
			service && serviceId != null
				? await titleContext(service, serviceId)
				: null;

		const seen = new Set();
		const titles = [titleOf(query) || query, ...(known?.titles ?? [])].filter(
			(t) => {
				const key = compact(t);
				if (!key || seen.has(key)) return false;
				seen.add(key);
				return true;
			},
		);
		const context = {
			titles: titles.slice(0, MAX_TITLES),
			year: parseYear(query) ?? known?.year ?? null,
			episode: parseEpisode(query) ?? known?.episode ?? null,
		};

		const queries = new Set([query.trim()]);
		context.titles.forEach((title, i) => {
			for (const q of queryVariants(title, {
				episode: context.episode,
				max: i === 0 ? 6 : 2,
			}))
				queries.add(q);
		});

		// No channel means every channel the account has. One that fails (left,
		// banned, rate limited) is skipped so it can't sink the whole search.
		const channels = channel ? [channel] : await listChannelIds();
		const toSend = [...queries].slice(0, MAX_QUERIES);
		const files = [];
		let failed = 0;
		// A few channels at a time: one after another is slow with dozens of
		// channels, all at once trips Telegram's flood limits.
		const pending = [...channels];
		const searchNext = async () => {
			while (pending.length > 0) {
				const id = pending.shift();
				try {
					files.push(...(await searchChannel(id, toSend)));
				} catch (err) {
					failed++;
					if (channel) throw err;
					logger.warn(`[TELEGRAM] Skipping channel ${id}: ${err.message}`);
				}
			}
		};
		const workers = Math.min(CHANNEL_CONCURRENCY, channels.length);
		await Promise.all(Array.from({ length: workers }, searchNext));
		if (channels.length > 0 && failed === channels.length)
			throw new Error("Search Error");
		const ranked = files
			.map((f) => ({
				...f,
				score: Math.max(
					scoreName(f.filename, context),
					scoreName(f.messageText, context) * 0.9,
				),
			}))
			.sort((a, b) => b.score - a.score || b.date - a.date);
		return { success: true, files: ranked };
	},

	postTelegramImport: async ({
		body: { service, serviceId, channel, messageId, filename },
	}) => {
		const SERVICES = getAllServices();
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

		const perfectName = await buildImportFilename({
			config,
			service,
			sid,
			filename,
		});

		logger.info(`[SERVER] 📥 Queueing Telegram download: ${perfectName}`);

		addToDownloadQueue("telegram", {
			service,
			serviceId: sid,
			channel,
			messageId,
			filename: perfectName,
		});

		return {
			success: true,
			message: "Added to download queue! Check Active Tasks.",
		};
	},
};
