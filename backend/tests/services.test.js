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

describe("External Service Integrations (*Arr & Prowlarr)", () => {
	let authCookie = "";

	beforeAll(async () => {
		authCookie = await getAuthCookie();
	});

	beforeEach(() => {
		vi.clearAllMocks();

		setSetting("radarrUrl", "http://fake-radarr:7878");
		setSetting("radarrApiKey", "fake_radarr_key");

		setSetting("sonarrUrl", "http://fake-sonarr:8989");
		setSetting("sonarrApiKey", "fake_sonarr_key");

		setSetting("lidarrUrl", "http://fake-lidarr:8686");
		setSetting("lidarrApiKey", "fake_lidarr_key");

		setSetting("prowlarrUrl", "http://fake-prowlarr:9696");
		setSetting("prowlarrApiKey", "fake_prowlarr_key");
	});

	it("GET /api/v1/missing - Should return missing items and unified queue", async () => {
		axios.get.mockResolvedValue({
			data: {
				records: [
					{
						id: 99,
						movieId: 10, // For Radarr
						episodeId: 20, // For Sonarr
						albumId: 30, // For Lidarr
						status: "downloading",
						trackedDownloadStatus: "Warning",
						title: "Test Movie",
						quality: { quality: { name: "1080p" } },
						indexer: "FakeTracker",
						timeleft: "00:05:00",
					},
				],
			},
		});

		const req = new Request("http://localhost/api/v1/missing", {
			headers: {
				Cookie: authCookie,
				"Content-Type": "application/json",
			},
		});
		const res = await app.handle(req);
		const body = await res.json();

		expect(res.status).toBe(200);
		expect(body.success).toBe(true);
		expect(body.queue.length).toBe(3);
		expect(body.queue[0].title).toBe("Test Movie");
	});

	it("POST /api/v1/missing/search - Should send correct search command to Sonarr", async () => {
		setSetting("sonarrUrl", "http://fake-sonarr:8989");
		setSetting("sonarrApiKey", "fake_sonarr_key");

		axios.post.mockResolvedValueOnce({
			data: { id: 123, name: "EpisodeSearch" },
		});

		const req = new Request("http://localhost/api/v1/missing/search", {
			method: "POST",
			headers: {
				Cookie: authCookie,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				service: "sonarr",
				id: 55, // Episode ID
			}),
		});

		const res = await app.handle(req);
		const body = await res.json();

		expect(res.status).toBe(200);
		expect(body.success).toBe(true);

		expect(axios.post).toHaveBeenCalledWith(
			"http://fake-sonarr:8989/api/v3/command",
			expect.objectContaining({ name: "EpisodeSearch", episodeIds: [55] }),
			expect.objectContaining({
				headers: { "X-Api-Key": "fake_sonarr_key" },
			}),
		);
	});

	it("POST /api/v1/missing/forcegrab - Should successfully push release to Radarr", async () => {
		axios.post.mockResolvedValueOnce({
			data: [{ rejected: false }],
		});

		const req = new Request("http://localhost/api/v1/missing/forcegrab", {
			method: "POST",
			headers: {
				Cookie: authCookie,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				service: "radarr",
				serviceId: 10,
				title: "Test Movie 2026",
				downloadUrl: "https://fake-indexer.com/download.torrent",
			}),
		});

		const res = await app.handle(req);
		const body = await res.json();

		expect(res.status).toBe(200);
		expect(body.success).toBe(true);
		expect(body.message).toBe("Grabbed successfully");

		expect(axios.post).toHaveBeenCalledWith(
			"http://fake-radarr:7878/api/v3/release/push", // Target URL
			expect.objectContaining({
				title: "Test Movie 2026",
				downloadUrl: "https://fake-indexer.com/download.torrent",
				protocol: "Torrent",
			}),
			expect.objectContaining({
				headers: { "X-Api-Key": "fake_radarr_key" },
			}),
		);
	});

	it("POST /api/v1/missing/deepsearch - Should fetch and map Prowlarr results", async () => {
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

		const req = new Request("http://localhost/api/v1/missing/deepsearch", {
			method: "POST",
			headers: {
				Cookie: authCookie,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				type: "movie",
				query: "Test Movie",
			}),
		});

		const res = await app.handle(req);
		const body = await res.json();

		expect(res.status).toBe(200);
		expect(body.success).toBe(true);
		expect(body.torrents.length).toBe(1);
		expect(body.torrents[0].title).toBe("Test.Movie.1080p");

		expect(axios.get).toHaveBeenCalledWith(
			"http://fake-prowlarr:9696/api/v1/search",
			expect.objectContaining({
				params: { query: "Test Movie", categories: "2000", type: "search" },
				headers: { "X-Api-Key": "fake_prowlarr_key" },
				timeout: 30000,
			}),
		);
	});
});
