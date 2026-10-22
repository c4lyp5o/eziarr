import { lookup } from "node:dns/promises";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { arr } from "./arr";
import { getSetting, getAllServices, getQueuedDownloadedPaths } from "./db";
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

	if (image.remoteUrl) return image.remoteUrl;

	return null;
};

// Percent downloaded (0-100) from an *Arr queue record, or null when the
// client hasn't reported a size yet.
export const queueProgress = (size, sizeleft) => {
	const total = Number(size);
	const left = Number(sizeleft);
	if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(left))
		return null;
	return Math.min(100, Math.max(0, Math.round((1 - left / total) * 100)));
};

const QUEUE_ID_KEYS = { radarr: "movieId", sonarr: "episodeId", lidarr: "albumId" };
const QUEUE_TTL_MS = 5000;
const queueCache = new Map(); // service -> { at, promise }
const queueDown = new Set(); // services whose last fetch failed, to log transitions only

const fetchQueueUncached = async (serviceName) => {
	const SERVICES = getAllServices();
	const conf = SERVICES[serviceName];
	if (!conf.url || !conf.apiKey) return [];

	const idKey = QUEUE_ID_KEYS[serviceName];

	const res = await arr(conf, serviceName).get("/queue", { timeout: 10000 });

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
			progress: queueProgress(item.size, item.sizeleft),
		}));
};

/**
 * One *Arr's queue. Every browser tab polls /missing (10s) and the Queue tab
 * polls every 2s, so a result (or failure) is shared for QUEUE_TTL_MS and a
 * fetch already in flight is reused rather than repeated.
 */
export const fetchQueue = (serviceName) => {
	const now = Date.now();
	const hit = queueCache.get(serviceName);
	if (hit && now - hit.at < QUEUE_TTL_MS) return hit.promise;
	const promise = fetchQueueUncached(serviceName);
	queueCache.set(serviceName, { at: now, promise });
	return promise;
};

export const resetQueueCache = () => {
	queueCache.clear();
	queueDown.clear();
};

/**
 * All three *Arr queues. A service that doesn't answer is listed in
 * `unavailable` instead of failing the whole request, so one *Arr restarting
 * doesn't take the UI down with it.
 */
export const fetchAllQueues = async () => {
	const services = Object.keys(QUEUE_ID_KEYS);
	const results = await Promise.allSettled(services.map(fetchQueue));
	const items = [];
	const unavailable = [];
	results.forEach((r, i) => {
		const service = services[i];
		if (r.status === "fulfilled") {
			items.push(...r.value);
			if (queueDown.delete(service))
				logger.info(`[QUEUE] ${service} is answering again.`);
		} else {
			unavailable.push(service);
			if (!queueDown.has(service)) {
				queueDown.add(service);
				logger.warn(
					`[QUEUE] ${service} queue unavailable: ${r.reason?.message ?? r.reason}`,
				);
			}
		}
	});
	return { items, unavailable };
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

// Address ranges a download, directory scan or proxy check treats as
// internal. Parsed by Node's BlockList, not string prefixes.
const BLOCKED = new net.BlockList();
for (const [addr, prefix] of [
	["0.0.0.0", 8], // "this network"
	["10.0.0.0", 8],
	["100.64.0.0", 10], // carrier-grade NAT
	["127.0.0.0", 8], // loopback
	["169.254.0.0", 16], // link-local, cloud metadata
	["172.16.0.0", 12],
	["192.0.0.0", 24], // IETF protocol assignments
	["192.168.0.0", 16],
	["198.18.0.0", 15], // benchmarking, often internal
	["224.0.0.0", 4], // multicast
	["240.0.0.0", 4], // reserved, incl. broadcast
])
	BLOCKED.addSubnet(addr, prefix, "ipv4");
for (const [addr, prefix] of [
	["::", 128], // unspecified
	["::1", 128], // loopback
	["100::", 64], // discard
	["2001::", 32], // Teredo: tunnels to an IPv4 we can't see
	["64:ff9b:1::", 48], // local-use NAT64
	["fc00::", 7], // unique local
	["fe80::", 10], // link-local
	["fec0::", 10], // site-local (deprecated)
	["ff00::", 8], // multicast
])
	BLOCKED.addSubnet(addr, prefix, "ipv6");

// The 8 hextets of an IPv6 address (accepts "::" and a dotted-quad tail).
const ipv6Hextets = (ip) => {
	let addr = ip.toLowerCase();
	const quad = addr.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
	if (quad) {
		const [a, b, c, d] = quad.slice(1).map(Number);
		addr = `${addr.slice(0, quad.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
	}
	const [head, tail] = addr.split("::");
	const parse = (part) => (part ? part.split(":").map((h) => Number.parseInt(h, 16)) : []);
	const left = parse(head);
	const right = tail === undefined ? [] : parse(tail);
	return [...left, ...Array(8 - left.length - right.length).fill(0), ...right];
};

const v4From = (hi, lo) => [hi >> 8, hi & 255, lo >> 8, lo & 255].join(".");

// The IPv4 address an IPv6 address stands for, when it carries one:
// IPv4-mapped/compatible (::ffff:a.b.c.d, ::a.b.c.d), NAT64 (64:ff9b::/96)
// and 6to4 (2002::/16). Connecting to these reaches that IPv4 host.
const embeddedIpv4 = (ip) => {
	const h = ipv6Hextets(ip);
	if (h.slice(0, 5).every((x) => x === 0) && (h[5] === 0xffff || h[5] === 0))
		return v4From(h[6], h[7]);
	if (h[0] === 0x64 && h[1] === 0xff9b && h.slice(2, 6).every((x) => x === 0))
		return v4From(h[6], h[7]);
	if (h[0] === 0x2002) return v4From(h[1], h[2]);
	return null;
};

const isIpDisallowed = (ip) => {
	const family = net.isIP(ip);

	if (family === 4) return BLOCKED.check(ip, "ipv4");
	if (family === 6) {
		if (BLOCKED.check(ip, "ipv6")) return true;
		const v4 = embeddedIpv4(ip);
		return v4 !== null && BLOCKED.check(v4, "ipv4");
	}

	// not an IP string
	return true;
};

// How many reverse proxies in front of Eziarr we trust to append to
// X-Forwarded-For (TRUST_PROXY, default 0). With none, the header is ignored:
// any client can send it, so trusting it by default let anyone pick their own
// rate-limit bucket.
const trustedProxyHops = () => {
	const n = Number.parseInt(process.env.TRUST_PROXY ?? "0", 10);
	return Number.isFinite(n) && n > 0 ? n : 0;
};

// Real client IP for rate limiting / audit logs.
// Bun's Request has no .ip property; the socket peer is only reachable via
// server.requestIP(request) (Elysia injects `server` into hooks and handlers).
export const getClientIp = (request, server) => {
	const directIp =
		server?.requestIP?.(request)?.address?.replace(/^::ffff:/, "") ?? null;

	const hops = trustedProxyHops();
	const xff = request.headers.get("x-forwarded-for");
	// Each proxy APPENDS the address it received the connection from, so the
	// client-controlled part is on the left. The client as our outermost
	// trusted proxy saw it is the entry `hops` places from the right.
	if (hops > 0 && xff && directIp && isIpDisallowed(directIp)) {
		const chain = xff
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);
		const client = chain[chain.length - hops];
		if (client) return client;
	}

	return directIp ?? "unknown";
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

	// If the hostname is already an IP literal, validate directly. URL keeps
	// the brackets on an IPv6 literal ("[::1]"), which net.isIP rejects.
	const literal = hostname.replace(/^\[(.*)\]$/, "$1");
	if (net.isIP(literal)) {
		return !isIpDisallowed(literal);
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

const safeDnsLookup = async (hostname, options, callback) => {
	try {
		const results = await lookup(hostname, { all: true, verbatim: true });
		if (!results?.length) {
			return callback(new Error("ENOTFOUND"), null, null);
		}

		// Ensure EVERY resolved IP for this hostname is safe
		for (const r of results) {
			if (isIpDisallowed(r.address)) {
				logger.warn(
					`[SSRF] Blocked connection to ${hostname} resolving to disallowed IP ${r.address}`,
				);
				return callback(new Error("SSRF Blocked: Disallowed IP"), null, null);
			}
		}

		// If safe, pass the very first resolved IP directly to the socket
		callback(null, results[0].address, results[0].family);
	} catch (err) {
		callback(err, null, null);
	}
};

export const safeHttpAgent = new http.Agent({ lookup: safeDnsLookup });
export const safeHttpsAgent = new https.Agent({ lookup: safeDnsLookup });

export const prepareFileDownload = async (filename) => {
	// basename strips directory components (.., /etc/.., C:\..) so filenames
	// coming from remote metadata can never escape DOWNLOAD_DIR; the regex
	// then removes filesystem-hostile characters.
	let safeFilename = path
		.basename(String(filename))
		.replace(/[/\\?%*:|"<>]/g, " ")
		.trim();

	if (!safeFilename || safeFilename === "." || safeFilename === "..") {
		safeFilename = `download_${Date.now()}`;
	}

	// Write the file flat into DOWNLOAD_DIR — no per-file subfolder.
	// The *Arr import path chokes on files nested in a folder.
	const outputDir = DOWNLOAD_DIR;
	let outputPath = path.join(DOWNLOAD_DIR, safeFilename);

	// Flat downloads mean two jobs for one title share a name. Never write
	// over a file another queued job is still waiting to import: number this
	// one instead ("Title (2026) (2).mp4"; the *Arrs parse title and year and
	// ignore the rest). The worker downloads one job at a time, so a queued
	// file is the only one that can be in use.
	const taken = getQueuedDownloadedPaths();
	if (taken.has(outputPath)) {
		const { name, ext } = path.parse(safeFilename);
		for (let n = 2; taken.has(outputPath); n++)
			outputPath = path.join(DOWNLOAD_DIR, `${name} (${n})${ext}`);
	}
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true });
	}
	return { outputDir, outputPath };
};

/**
 * Delete downloads older than `maxAgeMs`. Downloads land flat in `dir`, so
 * loose top-level files are swept; subfolders are legacy (pre-flat layout) and
 * are swept file by file, then removed once empty. Paths in `keep` belong to
 * queued jobs waiting to retry their import and are never deleted.
 */
export const sweepOldDownloads = (
	dir,
	{ maxAgeMs, keep = new Set(), now = Date.now() },
) => {
	const deleted = [];
	const sweepFile = (filePath) => {
		if (keep.has(filePath)) return;
		try {
			if (now - fs.statSync(filePath).mtimeMs > maxAgeMs) {
				fs.unlinkSync(filePath);
				deleted.push(filePath);
			}
		} catch {
			// It's perfectly fine if this fails.
		}
	};

	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const entryPath = path.join(dir, entry.name);
		if (entry.isFile()) {
			sweepFile(entryPath);
		} else if (entry.isDirectory()) {
			for (const file of fs.readdirSync(entryPath)) {
				sweepFile(path.join(entryPath, file));
			}
			try {
				if (fs.readdirSync(entryPath).length === 0) fs.rmdirSync(entryPath);
			} catch {
				// It's perfectly fine if this fails.
			}
		}
	}
	return deleted;
};
