import fs from "node:fs";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { lookup } from "node:dns/promises";
import net from "node:net";
import axios from "axios";
import { getSetting, getServicesConfig } from "./db";
import { generalLogger as logger } from "./logger";
import { DOWNLOAD_DIR } from "./config";

export const coerceNumericId = (value, fieldName = "id") => {
	const n = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(n)) {
		throw new Error(`${fieldName} must be a valid number`);
	}
	return n;
};

export const getPosterUrl = (images = [], coverType) => {
	const image = images.find((img) => img.coverType === coverType);
	if (!image) return null;

	if (image.remoteUrl) {
		return image.remoteUrl;
	}

	return null;
};

export const fetchQueue = async (serviceName, idKey) => {
	const SERVICES = getServicesConfig();
	const conf = SERVICES[serviceName];
	if (!conf.url || !conf.apiKey) return [];

	// Lidarr uses v1, others v3
	const apiVer = serviceName === "lidarr" ? "v1" : "v3";

	const res = await axios.get(`${conf.url}/api/${apiVer}/queue`, {
		headers: { "X-Api-Key": conf.apiKey },
		timeout: 30000,
	});

	return res.data.records
		.filter((item) => !["completed", "warning"].includes(item.status))
		.map((item) => ({
			service: serviceName,
			serviceId: item[idKey], // movieId, episodeId, or albumId
			status: item.status,
			trackStatus: item.trackedDownloadStatus,
			title: item.title,
			quality: item.quality?.quality?.name,
			indexer: item.indexer,
			timeleft: item.timeleft, // '00:05:30'
		}));
};

export const translatePath = (localPath) => {
	const remotePrefix = getSetting("pathMapRemote", "");

	let finalPath = localPath;

	// 1. Swap the prefixes ONLY IF remotePrefix is set
	if (remotePrefix) {
		finalPath = localPath.replace("/app/downloads", remotePrefix);
	}

	// 2. Cross-OS Slash Fix: If the remote path is Windows (starts with a Drive letter or \\)
	// Force all forward slashes to backslashes so Windows *Arr apps don't crash.
	if (/^[a-zA-Z]:\\|^\\\\/.test(remotePrefix)) {
		finalPath = finalPath.replace(/\//g, "\\");

		// Capitalize Drive Letter (d:\ -> D:\) for strict apps
		if (finalPath.match(/^[a-z]:/)) {
			finalPath = finalPath.charAt(0).toUpperCase() + finalPath.slice(1);
		}
	}

	return finalPath;
};

const isPrivateIpv4 = (ip) => {
	// ip is validated IPv4 string
	const [a, b] = ip.split(".").map((x) => Number.parseInt(x, 10));

	// 0.0.0.0/8 (includes 0.0.0.0)
	if (a === 0) return true;

	// 10.0.0.0/8
	if (a === 10) return true;

	// 127.0.0.0/8 (loopback)
	if (a === 127) return true;

	// 169.254.0.0/16 (link-local, includes cloud metadata hops sometimes)
	if (a === 169 && b === 254) return true;

	// 172.16.0.0/12
	if (a === 172 && b >= 16 && b <= 31) return true;

	// 192.168.0.0/16
	if (a === 192 && b === 168) return true;

	// 100.64.0.0/10 (carrier-grade NAT)
	if (a === 100 && b >= 64 && b <= 127) return true;

	return false;
};

const isPrivateIpv6 = (ip) => {
	const normalized = ip.toLowerCase();

	// :: / ::1
	if (normalized === "::" || normalized === "::1") return true;

	// fc00::/7 (unique local addresses)
	if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;

	// fe80::/10 (link-local unicast)
	if (normalized.startsWith("fe8") || normalized.startsWith("fe9")) return true;
	if (normalized.startsWith("fea") || normalized.startsWith("feb")) return true;

	// ::ffff:127.0.0.1 etc (IPv4-mapped IPv6) — treat as suspicious
	if (normalized.startsWith("::ffff:")) return true;

	return false;
};

const isIpDisallowed = (ip) => {
	const family = net.isIP(ip);

	if (family === 4) return isPrivateIpv4(ip);
	if (family === 6) return isPrivateIpv6(ip);

	// not an IP string
	return true;
};

export const isSafeUrl = async (urlString) => {
	let url;
	try {
		url = new URL(urlString);
	} catch (err) {
		logger.warn(`Invalid URL provided: ${urlString}. Error: `, err);
		return false;
	}

	// Protocol allowlist
	if (url.protocol !== "http:" && url.protocol !== "https:") return false;

	// Block obvious local hostnames early (even before DNS)
	const hostname = url.hostname.toLowerCase();
	if (
		hostname === "localhost" ||
		hostname === "localhost." ||
		hostname.endsWith(".localhost")
	) {
		return false;
	}

	// Optional: restrict ports (SSRF often targets internal admin ports)
	// If you want this restriction, uncomment:
	// const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
	// if (![80, 443].includes(port)) return false;

	// If the hostname is already an IP literal, validate directly
	if (net.isIP(hostname)) {
		return !isIpDisallowed(hostname);
	}

	// Resolve DNS and ensure none of the results point to disallowed ranges
	// Use { all: true } so we can check every A/AAAA record.
	try {
		const results = await lookup(hostname, { all: true, verbatim: true });

		// If DNS returns nothing, treat as unsafe
		if (!results?.length) return false;

		for (const r of results) {
			if (isIpDisallowed(r.address)) {
				logger.warn(
					`[SSRF] Blocked URL ${urlString} because ${hostname} resolved to disallowed IP ${r.address}`,
				);
				return false;
			}
		}

		return true;
	} catch (err) {
		logger.warn(
			`[SSRF] DNS lookup failed for ${hostname} (${urlString}): `,
			err,
		);
		return false;
	}
};

export const prepareFileDownload = async (filename) => {
	const safeFilename = filename.replace(/[/\\?%*:|"<>]/g, " ").trim();
	const folderName = path.parse(safeFilename).name;
	const outputDir = path.join(DOWNLOAD_DIR, folderName);
	const outputPath = path.join(outputDir, safeFilename);
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true });
		await setTimeout(2000);
	}
	return { outputDir, outputPath };
};
