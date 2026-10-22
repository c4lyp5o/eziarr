import { describe, it, expect, beforeEach } from "vitest";
import {
	isSafeUrl,
	translatePath,
	prepareFileDownload,
	sweepOldDownloads,
	queueProgress,
	getClientIp,
} from "../utils.js";
import {
	setSetting,
	addToDownloadQueue,
	markDownloadedPayload,
} from "../db.js";
import path from "node:path";
import fs from "node:fs";
import { DOWNLOAD_DIR, DB_DIR } from "../config.js";
import { Database } from "bun:sqlite";

describe("Security: SSRF Protection", () => {
	it("Should allow safe, external HTTP/HTTPS URLs", async () => {
		expect(await isSafeUrl("https://archive.org/download/movie.mp4")).toBe(
			true,
		);
		expect(
			await isSafeUrl("http://ipv4.download.thinkbroadband.com/5MB.zip"),
		).toBe(true);
	});

	it("Should reject local hostnames", async () => {
		expect(await isSafeUrl("http://localhost:7878")).toBe(false);
		expect(await isSafeUrl("http://localhost/admin")).toBe(false);
	});

	it("Should reject internal IPv4 addresses", async () => {
		expect(await isSafeUrl("http://127.0.0.1:8989")).toBe(false);
		expect(await isSafeUrl("http://192.168.1.100/secret")).toBe(false);
		expect(await isSafeUrl("http://10.0.0.5/api")).toBe(false);
		expect(await isSafeUrl("http://169.254.169.254/latest/meta-data/")).toBe(
			false,
		);
	});

	it("Should reject non-HTTP protocols", async () => {
		expect(await isSafeUrl("ftp://192.168.1.1/movie.mkv")).toBe(false);
		expect(await isSafeUrl("file:///etc/passwd")).toBe(false);
	});
});

describe("Utility: Cross-OS Path Translator", () => {
	beforeEach(() => {
		setSetting("pathMapRemote", "");
	});

	it("Should return the original path if no mapping is set", () => {
		const original = "/app/downloads/movie/movie.mkv";

		expect(translatePath(original)).toBe(original);
	});

	it("Should map a Docker path to a standard Linux remote path", () => {
		setSetting("pathMapRemote", "/mnt/storage/eziarr_downloads");

		const original = "/app/downloads/movie/movie.mkv";

		expect(translatePath(original)).toBe(
			"/mnt/storage/eziarr_downloads/movie/movie.mkv",
		);
	});

	it("Should map a Docker path to a Windows Drive (and flip slashes)", () => {
		setSetting("pathMapRemote", "C:\\Media\\Downloads");

		const original = "/app/downloads/movie/movie.mkv";
		const translated = translatePath(original);

		expect(translated).toBe("C:\\Media\\Downloads\\movie\\movie.mkv");
	});

	it("Should map a Docker path to a Windows UNC SMB Share (and flip slashes)", () => {
		setSetting("pathMapRemote", "\\\\Truenas\\Media\\Downloads");

		const original = "/app/downloads/movie/movie.mkv";
		const translated = translatePath(original);

		expect(translated).toBe("\\\\Truenas\\Media\\Downloads\\movie\\movie.mkv");
	});
});

describe("Security: Download Filename Sanitization", () => {
	it("Should keep a normal filename flat inside the downloads directory", async () => {
		const { outputDir, outputPath } = await prepareFileDownload("Movie (2026).mkv");

		expect(outputPath.startsWith(DOWNLOAD_DIR)).toBe(true);
		expect(path.basename(outputPath)).toBe("Movie (2026).mkv");
		expect(outputDir).toBe(DOWNLOAD_DIR);
	});

	it("Should strip directory components from traversal filenames", async () => {
		const { outputPath } = await prepareFileDownload("../../etc/passwd");

		expect(outputPath.startsWith(DOWNLOAD_DIR)).toBe(true);
		expect(path.basename(outputPath)).toBe("passwd");
	});

	it("Should never resolve a .. filename outside the downloads directory", async () => {
		const { outputDir, outputPath } = await prepareFileDownload("..");

		expect(outputPath.startsWith(DOWNLOAD_DIR)).toBe(true);
		expect(path.basename(outputDir)).not.toBe("..");
	});

	it("Should fall back to a generated name for empty filenames", async () => {
		const { outputPath } = await prepareFileDownload("");

		expect(outputPath.startsWith(DOWNLOAD_DIR)).toBe(true);
		expect(path.basename(outputPath)).toMatch(/^download_\d+$/);
	});
});

describe("Security: Client IP Resolution", () => {
	it("Should use the direct socket peer when no X-Forwarded-For is present", () => {
		const request = new Request("http://localhost/api/v1/login");
		const server = { requestIP: () => ({ address: "::ffff:127.0.0.1" }) };

		expect(getClientIp(request, server)).toBe("127.0.0.1");
	});

	// Security sweep #1: the client-controlled part of X-Forwarded-For is on
	// the LEFT; each proxy appends what it saw on the right.
	it("Should ignore X-Forwarded-For unless TRUST_PROXY is set", () => {
		const request = new Request("http://localhost/api/v1/login", {
			headers: { "x-forwarded-for": "203.0.113.9" },
		});
		const lanPeer = { requestIP: () => ({ address: "192.168.1.40" }) };

		expect(getClientIp(request, lanPeer)).toBe("192.168.1.40");
	});

	it("Should take the entry the trusted proxy appended, not the spoofable left one", () => {
		process.env.TRUST_PROXY = "1";
		try {
			const request = new Request("http://localhost/api/v1/login", {
				headers: { "x-forwarded-for": "1.2.3.4, 203.0.113.9" },
			});
			const proxyPeer = { requestIP: () => ({ address: "10.0.0.2" }) };
			expect(getClientIp(request, proxyPeer)).toBe("203.0.113.9");

			// Two hops (CDN in front of nginx): the client is second from the right.
			process.env.TRUST_PROXY = "2";
			const chained = new Request("http://localhost/api/v1/login", {
				headers: { "x-forwarded-for": "1.2.3.4, 203.0.113.9, 172.70.1.1" },
			});
			expect(getClientIp(chained, proxyPeer)).toBe("203.0.113.9");
		} finally {
			delete process.env.TRUST_PROXY;
		}
	});

	it("Should ignore spoofed X-Forwarded-For from a public direct peer", () => {
		process.env.TRUST_PROXY = "1";
		const request = new Request("http://localhost/api/v1/login", {
			headers: { "x-forwarded-for": "203.0.113.9" },
		});
		const publicPeer = { requestIP: () => ({ address: "198.51.100.7" }) };

		expect(getClientIp(request, publicPeer)).toBe("198.51.100.7");
		delete process.env.TRUST_PROXY;
	});

	it("Should fall back to unknown when no peer info is available", () => {
		const request = new Request("http://localhost/api/v1/login");

		expect(getClientIp(request, null)).toBe("unknown");
	});
});

describe("Downloads: sweeper", () => {
	const dir = "/tmp/eziarr-sweep-test";
	const DAY = 24 * 60 * 60 * 1000;
	const now = Date.now();
	const write = (rel, ageMs) => {
		const p = path.join(dir, rel);
		fs.mkdirSync(path.dirname(p), { recursive: true });
		fs.writeFileSync(p, "bytes");
		const t = new Date(now - ageMs);
		fs.utimesSync(p, t, t);
		return p;
	};

	beforeEach(() => fs.rmSync(dir, { recursive: true, force: true }));

	// Downloads land flat in DOWNLOAD_DIR; the sweeper used to only look inside
	// subfolders, so unimported flat files piled up forever.
	it("Should delete old flat files and keep fresh or still-queued ones", () => {
		const stale = write("Stale (2020).mp4", 2 * DAY);
		const fresh = write("Fresh (2026).mp4", 60 * 1000);
		const queued = write("Queued (2026).mp4", 2 * DAY);

		const deleted = sweepOldDownloads(dir, {
			maxAgeMs: DAY,
			keep: new Set([queued]),
			now,
		});

		expect(deleted).toEqual([stale]);
		expect(fs.existsSync(fresh)).toBe(true);
		expect(fs.existsSync(queued)).toBe(true);
	});

	it("Should still sweep legacy per-file subfolders and remove them once empty", () => {
		const legacy = write("Old Movie/Old Movie.mp4", 2 * DAY);

		expect(sweepOldDownloads(dir, { maxAgeMs: DAY, now })).toEqual([legacy]);
		expect(fs.existsSync(path.join(dir, "Old Movie"))).toBe(false);
	});
});

describe("Queue: download progress", () => {
	it("Should derive percent from the *Arr size and sizeleft", () => {
		expect(queueProgress(1000, 250)).toBe(75);
		expect(queueProgress(1000, 0)).toBe(100);
		expect(queueProgress(0, 0)).toBe(null);
		expect(queueProgress(undefined, undefined)).toBe(null);
	});
});

describe("Downloads: names never collide with a queued file", () => {
	it("Should number a download whose name another queued job still needs", async () => {
		const first = await prepareFileDownload("Polong (2026).mp4");
		expect(path.basename(first.outputPath)).toBe("Polong (2026).mp4");

		const job = addToDownloadQueue("telegram", { filename: "Polong (2026).mp4" });
		markDownloadedPayload(job, first.outputPath);

		try {
			const second = await prepareFileDownload("Polong (2026).mp4");
			expect(path.basename(second.outputPath)).toBe("Polong (2026) (2).mp4");
		} finally {
			// Don't leave a queued job behind: /missing reports the queue.
			const db = new Database(path.join(DB_DIR, "eziarr.sqlite"));
			db.run("DELETE FROM download_queue WHERE id = ?", [job]);
			db.close();
		}
	});
});

describe("Security: SSRF guard address ranges", () => {
	const cases = {
		blocked: [
			"http://[64:ff9b::7f00:1]/", // NAT64 of 127.0.0.1
			"http://[2002:c0a8:0101::1]/", // 6to4 of 192.168.1.1
			"http://[::ffff:10.0.0.1]/", // IPv4-mapped private
			"http://[2001:0:4136:e378::1]/", // Teredo
			"http://[ff02::1]/", // multicast
			"http://[fd00::1]/", // unique local
			"http://[::1]/",
			"http://224.0.0.1/",
			"http://198.18.0.5/",
			"http://255.255.255.255/",
		],
		allowed: [
			"http://[64:ff9b::808:808]/", // NAT64 of 8.8.8.8
			"http://[2002:0808:0808::1]/", // 6to4 of 8.8.8.8
			"http://[::ffff:8.8.8.8]/",
			"http://[2606:4700:4700::1111]/",
			"http://8.8.8.8/",
		],
	};

	it("Should block internal addresses in every form, including inside IPv6", async () => {
		for (const url of cases.blocked) expect([url, await isSafeUrl(url)]).toEqual([url, false]);
	});

	it("Should allow public addresses in the same forms", async () => {
		for (const url of cases.allowed) expect([url, await isSafeUrl(url)]).toEqual([url, true]);
	});
});

