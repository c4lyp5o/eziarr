import { getDownloadQueue, getDownloadHistory, getDownloadStats } from "../db";
import { fetchAllQueues } from "../utils";

export const DownloadsService = {
	getDownloadsQueue: async () => {
		const eziarrQueue = getDownloadQueue();

		const { items: arrQueueRaw, unavailable } = await fetchAllQueues();

		const arrQueueNormalized = arrQueueRaw.map((item, index) => ({
			id: `arr-${item.service}-${index}`,
			type: item.service, // radarr, sonarr, lidarr
			status: item.status,
			created_at: Date.now(),
			payload: JSON.stringify({
				filename: `${item.title} (${item.quality || "Unknown Quality"})`,
				service: item.service,
			}),
			message: item.timeleft
				? `Time left: ${item.timeleft}`
				: "Managed by *Arr",
			next_attempt: null,
			last_error: null,
		}));

		return {
			success: true,
			queue: [...eziarrQueue, ...arrQueueNormalized],
			unavailable,
		};
	},

	getDownloadsHistory: ({ query: { limit, status } }) => {
		const n = limit ? Math.min(500, Math.max(1, Number(limit))) : 100;
		return {
			success: true,
			history: getDownloadHistory(n, status || null),
		};
	},

	getDownloadsStats: () => {
		const stats = getDownloadStats();
		return { success: true, stats };
	},
};
