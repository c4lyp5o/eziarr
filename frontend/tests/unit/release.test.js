import { describe, it, expect } from "bun:test";
import {
	formatAge,
	parseRelease,
	rankResults,
	releaseWarnings,
} from "../../src/utils/release.js";

describe("parseRelease", () => {
	it("reads the usual parts of a release name", () => {
		expect(
			parseRelease("Polong.2026.2160p.WEB-DL.DDP5.1.Atmos.DV.HDR.H.265-GRP"),
		).toMatchObject({
			resolution: "2160p",
			source: "WEB-DL",
			codec: "HEVC",
			hdr: "Dolby Vision",
			audio: "Atmos",
			camera: false,
		});
		expect(parseRelease("Mat Kilau 2022 1080p BluRay x264")).toMatchObject({
			resolution: "1080p",
			source: "BluRay",
			codec: "x264",
		});
	});

	it("flags camera rips, and ranks them last", () => {
		const cam = parseRelease("Polong.2026.HDCAM.x264");
		expect(cam.camera).toBe(true);
		expect(cam.source).toBe("Camera");
		expect(cam.rank).toBeLessThan(parseRelease("Polong 2026 480p").rank);
		expect(parseRelease("Polong.2026.HDTS.720p").camera).toBe(true);
	});

	it("doesn't mistake words inside titles for tags", () => {
		const p = parseRelease("Cats.and.Dogs.2001.1080p.WEB-DL");
		expect(p.camera).toBe(false);
		expect(parseRelease("Tsunami.2004.720p.HDTV").camera).toBe(false);
	});
});

describe("releaseWarnings", () => {
	const at = (title, extra) => {
		const r = { title, size: 4e9, seeders: 10, protocol: "torrent", ...extra };
		return releaseWarnings(r, parseRelease(title), "movie");
	};

	it("warns about dead torrents but not usenet", () => {
		expect(at("Polong 1080p WEB-DL", { seeders: 0 })).toContain("No seeders");
		expect(
			at("Polong 1080p WEB-DL", { seeders: null, protocol: "usenet" }),
		).toEqual([]);
	});

	it("warns when a file is too small for its resolution", () => {
		expect(at("Polong 1080p WEB-DL", { size: 3e8 })).toContain(
			"Small for 1080p",
		);
		expect(at("Polong 1080p WEB-DL", { size: 2e9 })).toEqual([]);
	});
});

describe("rankResults", () => {
	const results = [
		{ title: "Polong.2026.HDCAM", size: 9e8, seeders: 900, indexer: "A" },
		{ title: "Polong.2026.720p.WEBRip", size: 1e9, seeders: 40, indexer: "A" },
		{ title: "Polong.2026.1080p.WEB-DL", size: 4e9, seeders: 12, indexer: "A" },
		{ title: "Polong 2026 1080p WEB-DL", size: 4e9, seeders: 30, indexer: "B" },
		{ title: "Polong.2026.1080p.BluRay", size: 9e9, seeders: 0, indexer: "C" },
	].map((r) => ({ protocol: "torrent", ...r }));

	it("merges the same release from several indexers", () => {
		const rows = rankResults(results);
		const webdl = rows.find((r) => r.parsed.source === "WEB-DL");
		expect(webdl.indexers).toEqual(["A", "B"]);
		expect(webdl.seeders).toBe(30);
		expect(rows).toHaveLength(4);
	});

	it("puts quality first and anything with a warning last", () => {
		const titles = rankResults(results).map((r) => r.parsed.source);
		expect(titles).toEqual(["WEB-DL", "WEBRip", "BluRay", "Camera"]);
	});

	it("can sort by seeders alone", () => {
		expect(rankResults(results, { sort: "seeders" })[0].parsed.camera).toBe(
			true,
		);
	});
});

describe("formatAge", () => {
	const now = Date.parse("2026-10-22T12:00:00Z");
	it("speaks in hours, days, months and years", () => {
		expect(formatAge("2026-10-22T09:00:00Z", now)).toBe("3 h");
		expect(formatAge("2026-10-17T12:00:00Z", now)).toBe("5 d");
		expect(formatAge("2026-07-22T12:00:00Z", now)).toBe("3 mo");
		expect(formatAge("2023-10-22T12:00:00Z", now)).toBe("3 y");
		expect(formatAge(null, now)).toBeNull();
	});
});
