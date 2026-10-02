import { vi, describe, it, expect, beforeAll, beforeEach } from "vitest";
import axios from "axios";
import { app } from "../index.js";
import { setSetting } from "../db.js";
import { getAuthCookie } from "./testUtils.js";

vi.mock("axios", () => {
	return {
		default: {
			get: vi.fn(),
			post: vi.fn(),
			put: vi.fn(),
			delete: vi.fn(),
		},
	};
});

// The forcegrab body, with a Japanese original-language title (id 8) as a
// stand-in for any non-English film (Audition, Polong, etc.).
const forceGrab = (body) =>
	new Request("http://localhost/api/v1/missing/forcegrab", {
		method: "POST",
		headers: {
			Cookie: authCookieGlobal,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});

let authCookieGlobal = "";

describe("Force-grab language bypass", () => {
	beforeAll(async () => {
		authCookieGlobal = await getAuthCookie();
	});

	beforeEach(() => {
		vi.clearAllMocks();
		setSetting("radarrUrl", "http://fake-radarr:7878");
		setSetting("radarrApiKey", "fake_radarr_key");
		setSetting("sonarrUrl", "http://fake-sonarr:8989");
		setSetting("sonarrApiKey", "fake_sonarr_key");
	});

	it("Gate blocks a wrong-language release for an English title", async () => {
		// release/push -> rejected, release languages = [German], title original = English
		axios.post.mockResolvedValueOnce({
			data: [
				{
					rejected: true,
					rejections: ["English is wanted, but found German"],
					languages: [{ id: 4, name: "German" }],
				},
			],
		});
		// movie originalLanguage = English (id 1)
		axios.get.mockResolvedValueOnce({
			data: { originalLanguage: { id: 1, name: "English" } },
		});

		const res = await app.handle(
			forceGrab({
				service: "radarr",
				serviceId: 40,
				title: "Some English Movie 2026",
				downloadUrl: "https://fake-indexer.com/download.torrent",
			}),
		);
		const body = await res.json();

		expect(body.success).toBe(false);
		expect(body.message).toContain("Not grabbing");
		expect(body.message).toContain("forceLanguage");
		// must NOT have touched qualityprofile or the movie (no mutation)
		expect(axios.put).not.toHaveBeenCalled();
		expect(axios.delete).not.toHaveBeenCalled();
	});

	it("Gate allows a matching non-English release and swaps Radarr to an Any-language profile", async () => {
		// 1) release/push -> rejected for language, release languages = [Japanese]
		axios.post.mockResolvedValueOnce({
			data: [
				{
					rejected: true,
					rejections: ["English is wanted, but found Japanese"],
					languages: [{ id: 8, name: "Japanese" }],
				},
			],
		});
		// 2) movie originalLanguage = Japanese -> gate allows
		axios.get.mockResolvedValueOnce({
			data: { originalLanguage: { id: 8, name: "Japanese" } },
		});
		// 3) _ensureAnyLanguageProfile: GET qualityprofile -> none has language.id -1
		axios.get.mockResolvedValueOnce({
			data: [
				{ id: 1, name: "Any", language: { id: 1, name: "English" } },
				{ id: 2, name: "SD", language: { id: 1, name: "English" } },
			],
		});
		// 4) POST create the Any-language profile -> returns id 99
		axios.post.mockResolvedValueOnce({ data: { id: 99, name: "eziarr-any-language" } });
		// 5) GET the movie (item) to clone
		axios.get.mockResolvedValueOnce({
			data: { id: 40, title: "Audition", qualityProfileId: 1, tags: [12] },
		});
		// 6) re-push -> accepted
		axios.post.mockResolvedValueOnce({ data: [{ rejected: false }] });

		const res = await app.handle(
			forceGrab({
				service: "radarr",
				serviceId: 40,
				title: "Audition 1999",
				downloadUrl: "https://fake-indexer.com/download.torrent",
			}),
		);
		const body = await res.json();

		expect(body.success).toBe(true);
		expect(body.message).toContain("Bypassed");
		// The swap PUT: movie moved onto the temp Any-language profile (id 99).
		expect(axios.put).toHaveBeenCalledWith(
			"http://fake-radarr:7878/api/v3/movie/40",
			expect.objectContaining({ qualityProfileId: 99 }),
			expect.anything(),
		);
		// The restore PUT: original movie payload (qualityProfileId 1 + tags back).
		// Audition has 2 tags, so the original payload differs from the swapped
		// payload — a single PUT could never satisfy both assertions, proving a
		// restore actually happened (not just the swap).
		expect(axios.put).toHaveBeenCalledWith(
			"http://fake-radarr:7878/api/v3/movie/40",
			expect.objectContaining({ qualityProfileId: 1, tags: [12] }),
			expect.anything(),
		);
		expect(axios.put).not.toHaveBeenCalledTimes(1); // swap + restore = 2
		// temp profile cleaned up
		expect(axios.delete).toHaveBeenCalledWith(
			"http://fake-radarr:7878/api/v3/qualityprofile/99",
			expect.anything(),
		);
	});

	it("forceLanguage=true overrides the gate", async () => {
		// rejected for language, release = German, title original = English, but forced
		axios.post.mockResolvedValueOnce({
			data: [
				{
					rejected: true,
					rejections: ["English is wanted, but found German"],
					languages: [{ id: 4, name: "German" }],
				},
			],
		});
		// gate: forceLanguage returns allowed before reading the movie
		// GET qualityprofile for the swap
		axios.get.mockResolvedValueOnce({
			data: [
				{ id: 1, name: "Any", language: { id: 1, name: "English" } },
			],
		});
		axios.post.mockResolvedValueOnce({ data: { id: 77, name: "eziarr-any-language" } });
		axios.get.mockResolvedValueOnce({
			data: { id: 40, title: "Some English Movie", qualityProfileId: 1, tags: [] },
		});
		axios.post.mockResolvedValueOnce({ data: [{ rejected: false }] });

		const res = await app.handle(
			forceGrab({
				service: "radarr",
				serviceId: 40,
				title: "Some English Movie 2026",
				downloadUrl: "https://fake-indexer.com/download.torrent",
				forceLanguage: true,
			}),
		);
		const body = await res.json();

		expect(body.success).toBe(true);
		expect(axios.put).toHaveBeenCalled(); // did the swap despite mismatch
	});

	it("Sonarr: language mismatch fails honestly, no silent no-op", async () => {
		// release/push -> rejected for language, release = Japanese
		axios.post.mockResolvedValueOnce({
			data: [
				{
					rejected: true,
					rejections: ["English is wanted, but found Japanese"],
					languages: [{ id: 8, name: "Japanese" }],
				},
			],
		});
		// episode -> series
		axios.get.mockResolvedValueOnce({ data: { seriesId: 5 } });
		// series originalLanguage = English (mismatch)
		axios.get.mockResolvedValueOnce({
			data: { originalLanguage: { id: 1, name: "English" } },
		});

		const res = await app.handle(
			forceGrab({
				service: "sonarr",
				serviceId: 123,
				title: "Some English Show S01E01",
				downloadUrl: "https://fake-indexer.com/download.torrent",
			}),
		);
		const body = await res.json();

		expect(body.success).toBe(false);
		expect(body.message).toContain("Not grabbing");
		expect(axios.put).not.toHaveBeenCalled(); // never mutated the series
	});
});
