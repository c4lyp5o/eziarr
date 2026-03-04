import { vi, describe, it, expect, beforeEach } from "vitest";
import axios from "axios";
import { app } from "../index.js";
import { setSetting } from "../db.js";

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

describe("External Service Integrations (*Arr & Prowlarr)", () => {
	beforeEach(() => {
		// Clear previous mock history before each test
		vi.clearAllMocks();

		// 2. Trick our database guards into thinking the apps are fully configured!
		setSetting("radarrUrl", "http://fake-radarr:7878");
		setSetting("radarrApiKey", "fake_radarr_key");

		setSetting("prowlarrUrl", "http://fake-prowlarr:9696");
		setSetting("prowlarrApiKey", "fake_prowlarr_key");
	});

	it("POST /api/v1/forcegrab - Should successfully push release to Radarr", async () => {
		// 1. Define what the fake *Arr app should return
		// (A successful push returns an array where rejected is false)
		axios.post.mockResolvedValueOnce({
			data: [{ rejected: false }],
		});

		// 2. Fire the request at our Elysia backend
		const req = new Request("http://localhost/api/v1/forcegrab", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				service: "radarr",
				serviceId: 10,
				title: "Test Movie 2026",
				downloadUrl: "https://fake-indexer.com/download.torrent",
			}),
		});

		const res = await app.handle(req);
		const body = await res.json();

		// 3. Check the Elysia Response
		expect(res.status).toBe(200);
		expect(body.success).toBe(true);
		expect(body.message).toBe("Grabbed successfully");

		// 4. THE MAGIC: Verify Elysia actually formatted the Axios request correctly!
		expect(axios.post).toHaveBeenCalledWith(
			"http://fake-radarr:7878/api/v3/release/push", // Target URL
			expect.objectContaining({
				// Payload
				title: "Test Movie 2026",
				downloadUrl: "https://fake-indexer.com/download.torrent",
				protocol: "Torrent",
			}),
			expect.objectContaining({
				// Headers
				headers: { "X-Api-Key": "fake_radarr_key" },
			}),
		);
	});

	it("POST /api/v1/deepsearch - Should fetch and map Prowlarr results", async () => {
		// 1. Fake Prowlarr Response
		axios.get.mockResolvedValueOnce({
			data: [
				{
					title: "Test.Movie.1080p",
					size: 1500000000,
					indexer: "FakeTracker",
					seeders: 45,
					leechers: 2,
					age: 10,
					downloadUrl: "https://fake-link",
					guid: "12345",
				},
			],
		});

		// 2. Fire the request
		const req = new Request("http://localhost/api/v1/deepsearch", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				type: "movie",
				query: "Test Movie",
			}),
		});

		const res = await app.handle(req);
		const body = await res.json();

		// 3. Assertions
		expect(res.status).toBe(200);
		expect(body.success).toBe(true);
		expect(body.torrents.length).toBe(1);
		expect(body.torrents[0].title).toBe("Test.Movie.1080p");

		// 4. Verify the Axios call
		expect(axios.get).toHaveBeenCalledWith(
			"http://fake-prowlarr:9696/api/v1/search",
			expect.objectContaining({
				params: { query: "Test Movie", categories: "2000", type: "search" },
				headers: { "X-Api-Key": "fake_prowlarr_key" },
			}),
		);
	});
});
