import axios from "axios";
import { getAllServices, applyMissingSync, upsertTask, removeTask } from "./db";
import { generalLogger as logger } from "./logger";
import { getPosterUrl } from "./utils";

const PAGE_SIZE = 250;
// A guard against an API that never stops paging (50,000 items), not a
// limit a real library should reach.
const MAX_PAGES = 200;

// Where each *Arr keeps its missing list, and how one record becomes a row.
const SOURCES = {
	radarr: {
		path: "/api/v3/wanted/missing",
		params: { sortKey: "releaseDate", sortDir: "desc" },
		toRow: (m) => ({
			id: `radarr-${m.id}`,
			serviceId: m.id,
			title: m.title,
			type: "movie",
			service: "radarr",
			releaseDate: m.inCinemas || m.digitalRelease,
			status: m.status,
			posterUrl: getPosterUrl(m.images, "poster"),
		}),
	},
	sonarr: {
		path: "/api/v3/wanted/missing",
		params: { sortKey: "airDateUtc", sortDir: "desc", includeSeries: true },
		toRow: (ep) => ({
			id: `sonarr-${ep.id}`,
			serviceId: ep.id,
			title: `${ep.series?.title || ""} - S${ep.seasonNumber}E${ep.episodeNumber}`,
			seriesTitle: ep.series?.title,
			type: "episode",
			service: "sonarr",
			releaseDate: ep.airDateUtc,
			status: "missing",
			posterUrl: getPosterUrl(ep.series?.images, "poster"),
		}),
	},
	lidarr: {
		path: "/api/v1/wanted/missing",
		params: { sortKey: "releaseDate", sortDir: "desc" },
		toRow: (album) => ({
			id: `lidarr-${album.id}`,
			serviceId: album.id,
			title: `${album.artist.artistName} - ${album.title}`,
			type: "album",
			service: "lidarr",
			releaseDate: album.releaseDate,
			status: "missing",
			posterUrl: getPosterUrl(album.images, "cover"),
		}),
	},
};

/**
 * Every page of one service's missing list. Throws if any page fails, so a
 * partial list can never make the cleanup delete titles it didn't see.
 */
export const fetchAllMissing = async (service, conf) => {
	const { path, params, toRow } = SOURCES[service];
	const rows = [];
	for (let page = 1; page <= MAX_PAGES; page++) {
		const res = await axios.get(`${conf.url}${path}`, {
			params: { ...params, page, pageSize: PAGE_SIZE },
			headers: { "X-Api-Key": conf.apiKey },
			timeout: 30000,
		});
		const records = res.data?.records ?? [];
		rows.push(...records.map(toRow));
		const total = Number(res.data?.totalRecords) || 0;
		if (records.length < PAGE_SIZE || (total && rows.length >= total))
			return rows;
	}
	throw new Error(`${service}: more than ${MAX_PAGES} pages of missing items`);
};

export const syncMissingItems = async () => {
	const SERVICES = getAllServices();

	try {
		upsertTask("worker-sync", "Sync", "running", "Syncing missing items...");
		logger.info("[WORKER/SYNC] 🔄 Syncing missing items.");

		const configured = Object.keys(SOURCES).filter((service) => {
			const conf = SERVICES[service];
			if (conf?.url && conf?.apiKey) return true;
			logger.warn(`[WORKER/SYNC] ${service} not configured. Skipping.`);
			return false;
		});

		const results = await Promise.allSettled(
			configured.map((service) => fetchAllMissing(service, SERVICES[service])),
		);

		const rows = [];
		const synced = new Set();
		results.forEach((r, i) => {
			const service = configured[i];
			if (r.status === "fulfilled") {
				rows.push(...r.value);
				synced.add(service);
			} else {
				logger.error(`[WORKER/SYNC] ${service} Sync Error :`, r.reason);
			}
		});

		const removed = applyMissingSync(rows, synced);
		if (removed > 0)
			logger.info(`[WORKER] 🧹 Cleaned up ${removed} downloaded/removed items.`);

		logger.info(`[WORKER] ✅ Syncing Complete: ${rows.length} missing items.`);
	} catch (err) {
		logger.error("[WORKER] Syncing Failed: :", err);
	} finally {
		removeTask("worker-sync");
	}
};
