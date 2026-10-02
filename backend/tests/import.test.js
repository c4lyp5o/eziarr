import {
	describe,
	it,
	expect,
	vi,
	beforeEach,
	afterEach,
	beforeAll,
	afterAll,
} from "vitest";
import axios from "axios";
import fs from "node:fs";
import {
	buildScanCommand,
	triggerArrImport,
	verifyArrImport,
	isImportableService,
} from "../import.js";
import { translatePath } from "../utils.js";
import { setSetting } from "../db.js";
import { DOWNLOAD_DIR } from "../config.js";

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

describe("Import: scan command shape", () => {
	beforeEach(() => setSetting("pathMapRemote", ""));

	// The production drop folder is the container path below, mapped to the
	// Windows share. A bare FILE path is only understood by Manual Import, so a
	// scan pointed at one is accepted (HTTP 201) and then silently does nothing.
	const CONTAINER_DROP_FOLDER = "/app/downloads";

	it("Should target the shared drop folder, never the file path", () => {
		setSetting("pathMapRemote", "D:\\Eziarr");

		expect(translatePath(CONTAINER_DROP_FOLDER)).toBe("D:\\Eziarr");

		const payload = buildScanCommand({ service: "radarr", serviceId: 2099 });
		expect(payload.path).not.toMatch(/\.(mp4|mkv)$/i);
		expect(payload.path).toBe(translatePath(DOWNLOAD_DIR));
	});

	it("Should keep the container path when no path mapping is set", () => {
		const payload = buildScanCommand({ service: "radarr", serviceId: 2099 });
		expect(payload.path).toBe(DOWNLOAD_DIR);
	});

	// movieId is sent, but Radarr silently drops it (measured: it never appears
	// in the echoed command body), so the scan itself is unscoped. What pins the
	// result to the right title is filename parsing plus verifyArrImport.
	it("Should send movieId for the movie that was just downloaded", () => {
		const payload = buildScanCommand({ service: "radarr", serviceId: 2099 });
		expect(payload.name).toBe("DownloadedMoviesScan");
		expect(payload.importMode).toBe("Move");
		expect(payload.movieId).toBe(2099);
	});

	it("Should omit movieId when the id is missing or not numeric", () => {
		for (const serviceId of [undefined, null, "abc", -5, 0]) {
			const payload = buildScanCommand({ service: "radarr", serviceId });
			expect(payload.movieId).toBeUndefined();
		}
	});

	it("Should not send a movieId to Sonarr", () => {
		const payload = buildScanCommand({ service: "sonarr", serviceId: 42 });
		expect(payload.name).toBe("DownloadedEpisodesScan");
		expect(payload.movieId).toBeUndefined();
	});

	it("Should use the Lidarr v1 endpoint command name", () => {
		expect(buildScanCommand({ service: "lidarr", serviceId: 7 }).name).toBe(
			"DownloadedAlbumsScan",
		);
	});
});

describe("Import: triggerArrImport posts the translated folder", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setSetting("pathMapRemote", "");
		axios.post.mockResolvedValue({ data: { status: "queued" } });
	});

	afterEach(() => vi.resetAllMocks());

	it("Should POST the drop folder with movieId", async () => {
		const config = {
			url: "https://radarr.example",
			apiKey: "secret",
		};
		await triggerArrImport({
			config,
			service: "radarr",
			serviceId: 2099,
		});

		expect(axios.post).toHaveBeenCalledTimes(1);
		const [url, body, opts] = axios.post.mock.calls[0];
		expect(url).toBe("https://radarr.example/api/v3/command");
		expect(body).toMatchObject({
			name: "DownloadedMoviesScan",
			importMode: "Move",
			movieId: 2099,
		});
		expect(body.path).not.toMatch(/\.mp4$/);
		expect(opts.headers["X-Api-Key"]).toBe("secret");
	});
});

describe("Import: verifyArrImport does not trust an accepted command", () => {
	const config = { url: "https://radarr.example", apiKey: "secret" };
	// The drop file must physically exist, otherwise the "a Move import
	// consumed the file" fallback short-circuits and masks what's being tested.
	let dropFile = "";

	beforeAll(() => {
		fs.mkdirSync("/tmp/eziarr-import-test", { recursive: true });
		dropFile = "/tmp/eziarr-import-test/Polong (2026).mp4";
		fs.writeFileSync(dropFile, "fake video bytes");
	});

	afterAll(() => {
		fs.rmSync("/tmp/eziarr-import-test", { recursive: true, force: true });
	});

	beforeEach(() => {
		vi.clearAllMocks();
		setSetting("pathMapRemote", "");
		fs.writeFileSync(dropFile, "fake video bytes");
	});
	afterEach(() => vi.resetAllMocks());

	it("Should report success once the movie has a file", async () => {
		axios.get
			.mockResolvedValueOnce({ data: { hasFile: false, movieFile: null } })
			.mockResolvedValueOnce({ data: { hasFile: true } });

		const verdict = await verifyArrImport({
			config,
			service: "radarr",
			serviceId: 2099,
			filePath: dropFile,
			timeoutMs: 10000,
			intervalMs: 1,
			sleep: async () => {},
		});
		expect(verdict.imported).toBe(true);
		expect(axios.get).toHaveBeenCalledTimes(2);
		expect(axios.get.mock.calls[0][0]).toBe(
			"https://radarr.example/api/v3/movie/2099",
		);
	});

	it("Should report failure when the movie never gets a file", async () => {
		axios.get.mockResolvedValue({ data: { hasFile: false } });

		const verdict = await verifyArrImport({
			config,
			service: "radarr",
			serviceId: 2099,
			filePath: dropFile,
			timeoutMs: 5,
			intervalMs: 1,
			sleep: async () => {},
		});
		expect(verdict.imported).toBe(false);
		expect(verdict.reason).toMatch(/imported nothing for movie 2099/);
	});

	it("Should treat a vanished drop-folder file as an import (Move consumed it)", async () => {
		axios.get.mockResolvedValue({ data: { hasFile: false } });

		const verdict = await verifyArrImport({
			config,
			service: "radarr",
			serviceId: 2099,
			filePath: "/tmp/eziarr-import-test/does-not-exist.mp4",
			timeoutMs: 10000,
			intervalMs: 1,
			sleep: async () => {},
		});
		expect(verdict.imported).toBe(true);
		expect(verdict.consumed).toBe(true);
	});

	it("Should stop polling when the movie id does not exist", async () => {
		const err = new Error("Not Found");
		err.response = { status: 404 };
		axios.get.mockRejectedValue(err);

		const verdict = await verifyArrImport({
			config,
			service: "radarr",
			serviceId: 99999999,
			filePath: dropFile,
			timeoutMs: 10000,
			intervalMs: 1,
			sleep: async () => {},
		});
		expect(verdict.imported).toBe(false);
		expect(axios.get).toHaveBeenCalledTimes(1);
		expect(verdict.reason).toMatch(/no item with id 99999999/);
	});

	it("Should keep checking while a transient API error clears", async () => {
		const err = new Error("ECONNRESET");
		axios.get
			.mockRejectedValueOnce(err)
			.mockResolvedValueOnce({ data: { hasFile: true } });

		const verdict = await verifyArrImport({
			config,
			service: "radarr",
			serviceId: 2099,
			filePath: dropFile,
			timeoutMs: 10000,
			intervalMs: 1,
			sleep: async () => {},
		});
		expect(verdict.imported).toBe(true);
		expect(axios.get).toHaveBeenCalledTimes(2);
	});
});

describe("Import: scope guard", () => {
	it("Should only claim verification for Radarr", () => {
		expect(isImportableService("radarr")).toBe(true);
		expect(isImportableService("sonarr")).toBe(false);
		expect(isImportableService("lidarr")).toBe(false);
	});
});
