import { vi, describe, it, expect, beforeEach } from "vitest";
import axios from "axios";
import { arr, apiVersion } from "../arr.js";

vi.mock("axios", () => ({
	default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

describe("*Arr client", () => {
	const config = { url: "http://lidarr.lan:8686", apiKey: "k" };
	beforeEach(() => vi.clearAllMocks());

	it("Should use v1 for Lidarr and Prowlarr, v3 for Radarr and Sonarr", () => {
		expect(apiVersion("lidarr")).toBe("v1");
		expect(apiVersion("prowlarr")).toBe("v1");
		expect(apiVersion("radarr")).toBe("v3");
		expect(apiVersion("sonarr")).toBe("v3");
	});

	// Force-grab used to call /api/v3/... for every service; Lidarr has no v3.
	it("Should send Lidarr calls to /api/v1 with the key and default timeout", async () => {
		await arr(config, "lidarr").post("/release/push", { title: "x" });
		expect(axios.post).toHaveBeenCalledWith(
			"http://lidarr.lan:8686/api/v1/release/push",
			{ title: "x" },
			{ headers: { "X-Api-Key": "k" }, timeout: 30000 },
		);
	});

	it("Should merge per-call params and a timeout override", async () => {
		await arr(config, "radarr", { timeout: 5000 }).get("/wanted/missing", {
			params: { page: 2 },
		});
		expect(axios.get).toHaveBeenCalledWith(
			"http://lidarr.lan:8686/api/v3/wanted/missing",
			{ params: { page: 2 }, headers: { "X-Api-Key": "k" }, timeout: 5000 },
		);
	});
});
