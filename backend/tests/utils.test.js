import { describe, it, expect, beforeEach } from "vitest";
import { isSafeUrl, translatePath } from "../utils.js";
import { setSetting } from "../db.js";

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
