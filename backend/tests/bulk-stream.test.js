import { vi, describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import axios from "axios";
import { app } from "../index.js";
import {
	setSetting,
	upsertMissingMedia,
	unmonitorManyMissingMedia,
	getMissingMedia,
} from "../db.js";
import { bumpTokenVersion } from "../session.js";
import { getAuthCookie } from "./testUtils.js";

vi.mock("axios", () => ({
	default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const ROWS = [
	{ service: "radarr", serviceId: 9101, type: "movie", title: "Bulk Movie A" },
	{ service: "radarr", serviceId: 9102, type: "movie", title: "Bulk Movie B" },
	{ service: "sonarr", serviceId: 9201, type: "episode", title: "Bulk Ep" },
].map((r) => ({
	...r,
	id: `${r.service}-${r.serviceId}`,
	releaseDate: "2020-01-01",
	posterUrl: null,
	status: "missing",
}));

let cookie = "";
const bulk = (body) =>
	app.handle(
		new Request("http://localhost/api/v1/missing/bulk", {
			method: "POST",
			headers: { Cookie: cookie, "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}),
	);
const ids = () => new Set(getMissingMedia().map((m) => m.id));

describe("Bulk search and unmonitor", () => {
	beforeAll(async () => {
		cookie = await getAuthCookie();
	});

	beforeEach(() => {
		vi.clearAllMocks();
		setSetting("radarrUrl", "http://fake-radarr:7878");
		setSetting("radarrApiKey", "k");
		setSetting("sonarrUrl", "http://fake-sonarr:8989");
		setSetting("sonarrApiKey", "k");
		for (const row of ROWS) upsertMissingMedia(row);
	});

	afterAll(() => unmonitorManyMissingMedia(ROWS.map((r) => r.id)));

	it("Sends one search command per service with every id", async () => {
		axios.post.mockResolvedValue({ data: {} });
		const res = await bulk({
			action: "search",
			items: ROWS.map(({ service, serviceId }) => ({ service, serviceId })),
		});
		const body = await res.json();

		expect(res.status).toBe(200);
		expect(body).toMatchObject({ success: true, done: 3, failed: [] });
		expect(axios.post).toHaveBeenCalledTimes(2);
		expect(axios.post).toHaveBeenCalledWith(
			"http://fake-radarr:7878/api/v3/command",
			{ name: "MoviesSearch", movieIds: [9101, 9102] },
			expect.anything(),
		);
		expect(axios.post).toHaveBeenCalledWith(
			"http://fake-sonarr:8989/api/v3/command",
			{ name: "EpisodeSearch", episodeIds: [9201] },
			expect.anything(),
		);
	});

	it("Removes rows only for the services that accepted the unmonitor", async () => {
		axios.put.mockImplementation((url) =>
			url.includes("fake-sonarr")
				? Promise.reject(new Error("sonarr down"))
				: Promise.resolve({ data: {} }),
		);
		const res = await bulk({
			action: "unmonitor",
			items: ROWS.map(({ service, serviceId }) => ({ service, serviceId })),
		});
		const body = await res.json();

		expect(body).toMatchObject({ success: false, done: 2, failed: ["sonarr"] });
		expect(axios.put).toHaveBeenCalledWith(
			"http://fake-radarr:7878/api/v3/movie/editor",
			{ movieIds: [9101, 9102], monitored: false },
			expect.anything(),
		);
		const left = ids();
		expect(left.has("radarr-9101")).toBe(false);
		expect(left.has("radarr-9102")).toBe(false);
		expect(left.has("sonarr-9201")).toBe(true);
	});

	it("Rejects an empty selection", async () => {
		const res = await bulk({ action: "search", items: [] });
		expect(res.status).toBe(400);
	});
});

describe("Live missing stream", () => {
	beforeAll(async () => {
		cookie = await getAuthCookie();
		// No *Arr answers matter here; an empty queue everywhere.
		axios.get.mockResolvedValue({ data: { records: [] } });
	});

	const open = () =>
		app.handle(
			new Request("http://localhost/api/v1/missing/stream", {
				headers: { Cookie: cookie },
			}),
		);

	// Read until `pattern` shows up (or the stream ends); returns the text.
	const readUntil = async (reader, pattern, ms = 8000) => {
		const decoder = new TextDecoder();
		let text = "";
		const deadline = Date.now() + ms;
		while (Date.now() < deadline && !pattern.test(text)) {
			const { value, done } = await Promise.race([
				reader.read(),
				Bun.sleep(deadline - Date.now()).then(() => ({ value: null })),
			]);
			if (done) return `${text}<<closed>>`;
			if (value) text += decoder.decode(value);
		}
		return text;
	};

	it("Sends the missing list and the queue as events", async () => {
		upsertMissingMedia(ROWS[0]);
		const res = await open();
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/event-stream");

		const reader = res.body.getReader();
		const text = await readUntil(reader, /event: queue\n/);
		await reader.cancel();
		unmonitorManyMissingMedia([ROWS[0].id]);

		const missing = text.match(/event: missing\ndata: (.*)\n/);
		expect(missing).not.toBeNull();
		expect(JSON.parse(missing[1]).some((m) => m.id === ROWS[0].id)).toBe(true);
		expect(text).toMatch(/event: queue\ndata: \{"queue":\[/);
	});

	it("Ends the stream once the session is no longer valid", async () => {
		const res = await open();
		const reader = res.body.getReader();
		await readUntil(reader, /event: missing\n/);

		bumpTokenVersion(); // what a password change does
		const text = await readUntil(reader, /<<closed>>/, 10000);
		expect(text).toContain("<<closed>>");
		cookie = await getAuthCookie();
	}, 15000);
});
