import axios from "axios";
import { getAllServices, addToDownloadQueue } from "../db";
import { coerceNumericId } from "../utils";
import { generalLogger as logger } from "../logger";

export const HTTPImportService = {
	postHTTPImport: async ({ body: { service, serviceId, url, filename } }) => {
		const SERVICES = getAllServices();
		const config = SERVICES[service];

		if (!config) return { success: false, message: "Invalid service" };

		if (!config.url || !config.apiKey) {
			logger.warn(`[SERVER] ${service} is not configured.`);
			return {
				success: false,
				message: `${service} is not configured.`,
			};
		}

		const sid = coerceNumericId(serviceId, "serviceId");

		let perfectName = filename;
		let ext = "";

		try {
			const lastDotIndex = filename.lastIndexOf(".");

			const defaultExt = service === "lidarr" ? ".mp3" : ".mp4";

			if (lastDotIndex === -1) {
				logger.warn(
					`[SERVER] No extension found in filename. Using ${defaultExt} as default. Original: ${filename}`,
				);
				ext = defaultExt;
			} else {
				ext = filename.substring(lastDotIndex).toLowerCase();

				if (ext.length > 10 || !ext.match(/^\.[a-z0-9]+$/)) {
					logger.warn(
						`[SERVER] Invalid extension extracted (${ext}). Falling back to ${defaultExt}.`,
					);
					ext = defaultExt;
				}
			}

			if (service === "radarr") {
				const res = await axios.get(`${config.url}/api/v3/movie/${sid}`, {
					headers: { "X-Api-Key": config.apiKey },
					timeout: 10000,
				});
				perfectName = `${res.data.title} (${res.data.year})${ext}`;
			} else if (service === "sonarr") {
				const epRes = await axios.get(`${config.url}/api/v3/episode/${sid}`, {
					headers: { "X-Api-Key": config.apiKey },
					timeout: 10000,
				});
				const sRes = await axios.get(
					`${config.url}/api/v3/series/${epRes.data.seriesId}`,
					{ headers: { "X-Api-Key": config.apiKey }, timeout: 10000 },
				);
				const sn = epRes.data.seasonNumber.toString().padStart(2, "0");
				const en = epRes.data.episodeNumber.toString().padStart(2, "0");
				perfectName = `${sRes.data.title} S${sn}E${en}${ext}`;
			} else if (service === "lidarr") {
				const alRes = await axios.get(`${config.url}/api/v1/album/${sid}`, {
					headers: { "X-Api-Key": config.apiKey },
					timeout: 10000,
				});
				perfectName = `${alRes.data.artist.artistName} - ${alRes.data.title}${ext}`;
			}

			perfectName = perfectName.replace(/[/\\?%*:|"<>]/g, "");
		} catch (err) {
			logger.warn(
				`[SERVER] Failed to fetch exact title for renaming, falling back to original: ${err.message}`,
			);
		}

		logger.info(`[SERVER] 📥 Queueing HTTP download: ${perfectName}`);

		addToDownloadQueue("http", {
			service,
			serviceId: sid,
			url,
			filename: perfectName,
		});

		return {
			success: true,
			message: `Added to download queue! Check Active Tasks.`,
		};
	},
};
