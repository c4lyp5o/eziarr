import { vi, describe, it, expect, beforeAll, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import { app } from "../index.js";
import { setSetting, getMissingMedia, clearMissingMedia } from "../db.js";
import { fetchAllQueues, resetQueueCache } from "../utils.js";
import { syncMissingItems } from "../sync.js";
import { readTailLines, tailLogs } from "../logtail.js";
import { getAuthCookie } from "./testUtils.js";

vi.mock("axios", () => ({
	default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const configure = (services) => {
	for (const s of ["radarr", "sonarr", "lidarr"]) {
		setSetting(`${s}Url`, services.includes(s) ? `http://${s}.lan` : "");
		setSetting(`${s}ApiKey`, services.includes(s) ? "key" : "");
	}
};

// Route axios.get by URL prefix: { "http://radarr.lan": fn(url, opts) }.
const routeGet = (routes) =>
	axios.get.mockImplementation(async (url, opts) => {
		for (const [prefix, handler] of Object.entries(routes))
			if (url.startsWith(prefix)) return handler(url, opts);
		throw new Error(`unrouted ${url}`);
	});

const record = (id, extra = {}) => ({
	movieId: id,
	status: "downloading",
	trackedDownloadStatus: "ok",
	title: `t${id}`,
	size: 1000,
	sizeleft: 250,
	...extra,
});

describe("Queues: one *Arr down must not take the rest with it", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetQueueCache();
		configure(["radarr", "sonarr"]);
	});

	it("Should return the queues that answered and name the one that didn't", async () => {
		routeGet({
			"http://radarr.lan": async () => ({ data: { records: [record(5)] } }),
			"http://sonarr.lan": async () => {
				throw new Error("ECONNREFUSED");
			},
		});

		const { items, unavailable } = await fetchAllQueues();

		expect(items.map((i) => i.serviceId)).toEqual([5]);
		expect(unavailable).toEqual(["sonarr"]);
	});

	it("Should share one fetch per *Arr across callers for a few seconds", async () => {
		routeGet({
			"http://radarr.lan": async () => ({ data: { records: [] } }),
			"http://sonarr.lan": async () => ({ data: { records: [] } }),
		});

		await Promise.all([fetchAllQueues(), fetchAllQueues()]);
		await fetchAllQueues();

		expect(axios.get).toHaveBeenCalledTimes(2); // radarr + sonarr, once each
	});

	it("GET /missing - Should answer 200 with progress and the unavailable list", async () => {
		const cookie = await getAuthCookie();
		configure(["radarr", "sonarr"]);
		routeGet({
			"http://radarr.lan": async () => ({ data: { records: [record(5)] } }),
			"http://sonarr.lan": async () => {
				throw new Error("ECONNREFUSED");
			},
		});

		const res = await app.handle(
			new Request("http://localhost/api/v1/missing", { headers: { Cookie: cookie } }),
		);
		const body = await res.json();

		expect(res.status).toBe(200);
		// The response schema used to strip this field on its way out.
		expect(body.queue[0].progress).toBe(75);
		expect(body.unavailable).toEqual(["sonarr"]);
	});
});

describe("Sync: every page, and no cleanup from a partial list", () => {
	const movies = (from, n) =>
		Array.from({ length: n }, (_, i) => ({ id: from + i, title: `Movie ${from + i}`, status: "released", images: [] }));

	beforeEach(() => {
		vi.clearAllMocks();
		clearMissingMedia();
		configure(["radarr"]);
	});

	it("Should page past the first page and store every missing title", async () => {
		routeGet({
			"http://radarr.lan": async (_url, { params }) => ({
				data: {
					totalRecords: 300,
					records: params.page === 1 ? movies(1, 250) : movies(251, 50),
				},
			}),
		});

		await syncMissingItems();

		expect(getMissingMedia()).toHaveLength(300);
		expect(axios.get).toHaveBeenCalledTimes(2);
	});

	it("Should keep existing titles when a later page fails", async () => {
		routeGet({
			"http://radarr.lan": async () => ({ data: { totalRecords: 3, records: movies(1, 3) } }),
		});
		await syncMissingItems();
		expect(getMissingMedia()).toHaveLength(3);

		routeGet({
			"http://radarr.lan": async (_url, { params }) => {
				if (params.page === 2) throw new Error("timeout");
				return { data: { totalRecords: 500, records: movies(10, 250) } };
			},
		});
		await syncMissingItems();

		// Nothing was written or removed from the failed sync.
		expect(getMissingMedia().map((m) => m.serviceId).sort((a, b) => a - b)).toEqual([1, 2, 3]);
	});

	it("Should remove titles a complete sync no longer lists", async () => {
		routeGet({
			"http://radarr.lan": async () => ({ data: { totalRecords: 3, records: movies(1, 3) } }),
		});
		await syncMissingItems();

		routeGet({
			"http://radarr.lan": async () => ({ data: { totalRecords: 1, records: movies(2, 1) } }),
		});
		await syncMissingItems();

		expect(getMissingMedia().map((m) => m.serviceId)).toEqual([2]);
	});
});

describe("Logs: tail only, merged by time", () => {
	const dir = "/tmp/eziarr-logtail-test";
	const at = (t, msg) => `[INFO] [2026-10-22 ${t}.000] - ${msg}`;

	beforeAll(() => {
		fs.rmSync(dir, { recursive: true, force: true });
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(
			path.join(dir, "general.log"),
			[at("09:00:01", "server a"), at("09:00:03", "server b"), "    at stack line", ""].join("\n"),
		);
		fs.writeFileSync(
			path.join(dir, "worker.log"),
			[at("09:00:02", "worker a"), at("09:00:04", "worker b"), ""].join("\n"),
		);
	});

	it("Should merge two files by timestamp and keep stack lines with their entry", () => {
		const lines = tailLogs([path.join(dir, "general.log"), path.join(dir, "worker.log")]);
		expect(lines.map((l) => l.replace(/^.*- /, ""))).toEqual([
			"server a",
			"worker a",
			"server b",
			"    at stack line",
			"worker b",
		]);
	});

	it("Should read only the tail and drop the line it cut", () => {
		const big = path.join(dir, "big.log");
		fs.writeFileSync(big, `${"x".repeat(5000)}\n${at("09:00:05", "last")}\n`);
		expect(readTailLines(big, 100)).toEqual([at("09:00:05", "last")]);
		expect(readTailLines(path.join(dir, "missing.log"))).toEqual([]);
	});
});
