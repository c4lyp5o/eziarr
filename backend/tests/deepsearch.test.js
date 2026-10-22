import { vi, describe, it, expect, beforeAll, beforeEach } from "vitest";
import axios from "axios";
import { app } from "../index.js";
import { setSetting } from "../db.js";
import { getAuthCookie } from "./testUtils.js";

vi.mock("axios", () => ({
	default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

// What Prowlarr's /api/v1/search returns, trimmed to the fields that matter.
const PROWLARR = [
	{
		guid: "a",
		title: "Polong.2026.1080p.WEB-DL.DDP5.1.H.264",
		size: 4294967296,
		indexer: "MalaysiaBits",
		seeders: 48,
		leechers: 3,
		grabs: 310,
		age: 2,
		publishDate: "2026-10-20T08:00:00Z",
		protocol: "torrent",
		indexerFlags: ["freeleech"],
		infoUrl: "https://tracker.example/details/1",
		downloadUrl: "https://tracker.example/dl/1",
	},
	{
		guid: "b",
		title: "Polong 2026 720p",
		size: 1073741824,
		indexer: "NZBgeek",
		age: 5,
		publishDate: "2026-10-17T08:00:00Z",
		protocol: "usenet",
		downloadUrl: "https://nzb.example/get/2",
	},
];

describe("Deep search results", () => {
	let cookie = "";

	beforeAll(async () => {
		cookie = await getAuthCookie();
	});

	beforeEach(() => {
		vi.clearAllMocks();
		setSetting("prowlarrUrl", "http://fake-prowlarr:9696");
		setSetting("prowlarrApiKey", "k");
	});

	it("passes Prowlarr's details through to the UI", async () => {
		axios.get.mockResolvedValueOnce({ data: PROWLARR });
		const res = await app.handle(
			new Request("http://localhost/api/v1/missing/deepsearch", {
				method: "POST",
				headers: { Cookie: cookie, "Content-Type": "application/json" },
				body: JSON.stringify({ type: "movie", query: "Polong" }),
			}),
		);
		const body = await res.json();

		expect(res.status).toBe(200);
		expect(body.torrents[0]).toMatchObject({
			title: "Polong.2026.1080p.WEB-DL.DDP5.1.H.264",
			seeders: 48,
			leechers: 3,
			grabs: 310,
			publishDate: "2026-10-20T08:00:00Z",
			protocol: "torrent",
			freeleech: true,
			infoUrl: "https://tracker.example/details/1",
		});
		// Usenet: no peers, which is not the same as a dead torrent.
		expect(body.torrents[1]).toMatchObject({
			protocol: "usenet",
			seeders: null,
			freeleech: false,
		});
	});
});
