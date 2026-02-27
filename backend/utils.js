import path from "node:path";
import axios from "axios";
import { getSetting } from "./db";

export const SERVICES = {
	sonarr: {
		url: process.env.SONARR_URL || "http://localhost:8989",
		apiKey: process.env.SONARR_API_KEY || "",
	},
	radarr: {
		url: process.env.RADARR_URL || "http://localhost:7878",
		apiKey: process.env.RADARR_API_KEY || "",
	},
	lidarr: {
		url: process.env.LIDARR_URL || "http://localhost:8686",
		apiKey: process.env.LIDARR_API_KEY || "",
	},
	prowlarr: {
		url: process.env.PROWLARR_URL || "http://localhost:9696",
		apiKey: process.env.PROWLARR_API_KEY || "",
	},
};

export const getPosterUrl = (images = [], serviceKey, coverType) => {
	const image = images.find((img) => img.coverType === coverType);
	if (!image) return null;
	if (image.url) {
		const { url, apiKey } = SERVICES[serviceKey];
		return `${url}${image.url}?apikey=${apiKey}`;
	} else {
		return image.remoteUrl || null;
	}
};

export const fetchQueue = async (serviceName, idKey) => {
	try {
		const conf = SERVICES[serviceName];
		// Lidarr uses v1, others v3
		const apiVer = serviceName === "lidarr" ? "v1" : "v3";

		const res = await axios.get(`${conf.url}/api/${apiVer}/queue`, {
			headers: { "X-Api-Key": conf.apiKey },
		});

		return res.data.records
    .filter((item) => item.status !== "completed")
    .map((item) => ({
			serviceId: item[idKey], // movieId, episodeId, or albumId
			service: serviceName,
			status: item.status,
			trackStatus: item.trackedDownloadStatus,
			quality: item.quality?.quality?.name,
			timeleft: item.timeleft, // '00:05:30'
			indexer: item.indexer,
			title: item.title,
		}));
	} catch (err) {
		console.error(`[UTILS] Failed to fetch ${serviceName} queue`, err);
		return [];
	}
};

export const translatePath = (localPath) => {
	const dockerPrefix = getSetting("PATH_MAP_DOCKER", "");
	const remotePrefix = getSetting("PATH_MAP_REMOTE", "");

	let finalPath = localPath;

	// 1. Only translate if configs exist (Not needed for Local setup)
	if (dockerPrefix && remotePrefix) {
		finalPath = localPath.replace(dockerPrefix, remotePrefix);
	}

	// 2. WINDOWS FIX: Normalize Slashes
	// If we are on Windows, ensure we use Backslashes '\' everywhere.
	// Node's path.sep returns '\' on Windows and '/' on Linux.
	if (path.sep === "\\") {
		finalPath = finalPath.replace(/\//g, "\\");

		// Optional: Capitalize Drive Letter (c:\ -> C:\) for strict apps
		if (finalPath.match(/^[a-z]:/)) {
			finalPath = finalPath.charAt(0).toUpperCase() + finalPath.slice(1);
		}
	}

	return finalPath;
};
