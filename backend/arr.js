import axios from "axios";

// Lidarr and Prowlarr speak API v1; Radarr and Sonarr v3.
const API_VERSION = { radarr: "v3", sonarr: "v3", lidarr: "v1", prowlarr: "v1" };

export const apiVersion = (service) => API_VERSION[service] ?? "v3";

/**
 * Requests to one *Arr. The base URL, API version and key are applied once;
 * paths are relative to /api/<version>:
 *
 *   arr(config, "radarr").get("/movie/5")  →  GET {url}/api/v3/movie/5
 *
 * Calls go straight through axios.get/post/put/delete, so per-call options
 * (params, a different timeout) are passed as the last argument.
 */
export const arr = (config, service, { timeout = 30000 } = {}) => {
	const base = `${config.url}/api/${apiVersion(service)}`;
	const opts = (extra = {}) => ({
		...extra,
		headers: { "X-Api-Key": config.apiKey, ...extra.headers },
		timeout: extra.timeout ?? timeout,
	});
	return {
		get: (path, extra) => axios.get(`${base}${path}`, opts(extra)),
		delete: (path, extra) => axios.delete(`${base}${path}`, opts(extra)),
		post: (path, data, extra) => axios.post(`${base}${path}`, data, opts(extra)),
		put: (path, data, extra) => axios.put(`${base}${path}`, data, opts(extra)),
	};
};
