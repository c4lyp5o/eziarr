import { describe, it, expect, beforeEach } from "vitest";
import {
	isSafeUrl,
	translatePath,
	prepareFileDownload,
	getClientIp,
} from "../utils.js";
import { setSetting } from "../db.js";
import path from "node:path";
import { DOWNLOAD_DIR } from "../config.js";

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

	it("Should trust X-Forwarded-For only when the direct peer is a proxy", () => {
		const request = new Request("http://localhost/api/v1/login", {
			headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.2" },
		});
		const proxyPeer = { requestIP: () => ({ address: "10.0.0.2" }) };

		expect(getClientIp(request, proxyPeer)).toBe("203.0.113.9");
	});

	it("Should ignore spoofed X-Forwarded-For from a public direct peer", () => {
		const request = new Request("http://localhost/api/v1/login", {
			headers: { "x-forwarded-for": "203.0.113.9" },
		});
		const publicPeer = { requestIP: () => ({ address: "198.51.100.7" }) };

		expect(getClientIp(request, publicPeer)).toBe("198.51.100.7");
	});

	it("Should fall back to unknown when no peer info is available", () => {
		const request = new Request("http://localhost/api/v1/login");

		expect(getClientIp(request, null)).toBe("unknown");
	});
});
