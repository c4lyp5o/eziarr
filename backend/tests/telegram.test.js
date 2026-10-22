import {
	vi,
	describe,
	it,
	expect,
	beforeAll,
	beforeEach,
	afterAll,
} from "vitest";
import axios from "axios";
import { app } from "../index.js";
import { setSetting } from "../db.js";
import { getAuthCookie } from "./testUtils.js";

const mockTelegramClientInstance = {
	connect: vi.fn().mockResolvedValue(true),
	sendCode: vi.fn().mockResolvedValue({ phoneCodeHash: "fake_hash_123" }),
	invoke: vi.fn().mockResolvedValue(true),
	signInWithPassword: vi.fn().mockResolvedValue(true),
	checkAuthorization: vi.fn().mockResolvedValue(true),
	getEntity: vi.fn().mockResolvedValue({ title: "Test channel" }),
	session: { save: vi.fn().mockReturnValue("fake_session_string") },
};

vi.mock("telegram", () => {
	return {
		TelegramClient: vi.fn(() => mockTelegramClientInstance),
		Api: {
			auth: { SignIn: vi.fn() },
			// Constructors that keep their arguments, so the search test can
			// see which queries were sent.
			messages: {
				Search: class {
					constructor(args) {
						Object.assign(this, args);
					}
				},
			},
			InputMessagesFilterEmpty: class {},
		},
	};
});

vi.mock("axios", () => ({
	default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

vi.mock("telegram/sessions", () => ({
	StringSession: vi.fn(),
}));

describe("Telegram Authentication Flow", () => {
	let authCookie = "";

	beforeAll(async () => {
		authCookie = await getAuthCookie();
	});

	beforeEach(() => {
		vi.clearAllMocks();
		setSetting("telegramApiId", "12345");
		setSetting("telegramApiHash", "fake_telegram_hash");
		// What send-code leaves behind, so each login test stands on its own
		// (it used to rely on the send-code test running first).
		setSetting("telegramTempHash", "fake_hash_123");
		setSetting("telegramTempPhoneNumber", "+1234567890");
	});

	it("POST /api/v1/telegram/auth/send-code - Should request SMS code", async () => {
		const req = new Request("http://localhost/api/v1/telegram/auth/send-code", {
			method: "POST",
			headers: {
				Cookie: authCookie,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ phoneNumber: "+1234567890" }),
		});

		const res = await app.handle(req);
		const body = await res.json();

		expect(res.status).toBe(200);
		expect(body.success).toBe(true);
		expect(body.message).toBe("Code sent successfully");
		expect(mockTelegramClientInstance.sendCode).toHaveBeenCalledWith(
			{ apiId: 12345, apiHash: "fake_telegram_hash" },
			"+1234567890",
		);
	});

	it("POST /api/v1/telegram/auth/login - Should complete login successfully", async () => {

		const req = new Request("http://localhost/api/v1/telegram/auth/login", {
			method: "POST",
			headers: {
				Cookie: authCookie,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ code: "55555" }),
		});

		const res = await app.handle(req);
		const body = await res.json();

		expect(res.status).toBe(200);
		expect(body.success).toBe(true);
		expect(body.message).toBe("Login successful");
		expect(mockTelegramClientInstance.session.save).toHaveBeenCalled();
	});

	it("POST /api/v1/telegram/auth/login - Should request 2FA password if needed", async () => {
		mockTelegramClientInstance.invoke.mockRejectedValueOnce(
			new Error("SESSION_PASSWORD_NEEDED"),
		);

		const req = new Request("http://localhost/api/v1/telegram/auth/login", {
			method: "POST",
			headers: {
				Cookie: authCookie,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ code: "55555", password: "" }), // Notice: No password provided!
		});

		const res = await app.handle(req);
		const body = await res.json();

		expect(res.status).toBe(200);
		expect(body.success).toBe(false);
		expect(body.message).toBe("2FA_NEEDED"); // Your frontend checks for this!
	});
});

describe("Telegram search", () => {
	// Files in the channel, and a stand-in for Telegram's search: like the
	// real one it matches whole words, so "5 cm" does not find "5cm".
	const CHANNEL_FILES = [
		"5cm.2007.1080p.mkv",
		"15cm.Something.2019.mkv",
		"Other Movie 2007.mkv",
		"Byousoku.5.Centimeter.2007.720p.mkv",
	];
	const wordsOf = (s) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
	const telegramSearch = (req) => {
		if (typeof req?.q !== "string") return true;
		const wanted = wordsOf(req.q);
		return {
			messages: CHANNEL_FILES.map((fileName, i) => ({ fileName, id: i + 1 }))
				.filter(({ fileName }) =>
					wanted.every((w) => wordsOf(fileName).includes(w)),
				)
				.map(({ fileName, id }) => ({
					id,
					date: 1700000000 + id,
					message: "",
					media: {
						document: {
							size: 1000,
							attributes: [{ className: "DocumentAttributeFilename", fileName }],
						},
					},
				})),
		};
	};

	let cookie = "";
	const search = (body) =>
		app.handle(
			new Request("http://localhost/api/v1/telegram/search", {
				method: "POST",
				headers: { Cookie: cookie, "Content-Type": "application/json" },
				body: JSON.stringify({ channel: "@testchannel", ...body }),
			}),
		);
	const sentQueries = () =>
		mockTelegramClientInstance.invoke.mock.calls
			.map(([req]) => req.q)
			.filter(Boolean);

	beforeAll(async () => {
		cookie = await getAuthCookie();
	});

	beforeEach(() => {
		vi.clearAllMocks();
		setSetting("telegramApiId", "12345");
		setSetting("telegramApiHash", "fake_telegram_hash");
		mockTelegramClientInstance.invoke.mockImplementation(async (req) =>
			telegramSearch(req),
		);
	});

	afterAll(() => {
		mockTelegramClientInstance.invoke.mockReset();
		mockTelegramClientInstance.invoke.mockResolvedValue(true);
	});

	it('finds "5cm" when searching for "5 cm", and ranks it first', async () => {
		const res = await search({ query: "5 cm (2007)" });
		const body = await res.json();

		expect(res.status).toBe(200);
		expect(sentQueries()).toContain("5cm");
		expect(body.files[0].filename).toBe("5cm.2007.1080p.mkv");
		expect(body.files[0].score).toBeGreaterThanOrEqual(1);
		const other = body.files.find((f) => f.filename.startsWith("15cm"));
		if (other) expect(other.score).toBeLessThan(0.5);
	});

	it("also searches the alternate titles Radarr knows", async () => {
		setSetting("radarrUrl", "http://fake-radarr:7878");
		setSetting("radarrApiKey", "k");
		axios.get.mockResolvedValueOnce({
			data: {
				title: "5 Centimeters per Second",
				originalTitle: "Byousoku 5 Centimeter",
				alternateTitles: [],
				year: 2007,
			},
		});

		const res = await search({
			query: "5 Centimeters per Second",
			service: "radarr",
			serviceId: 7,
		});
		const body = await res.json();

		expect(axios.get).toHaveBeenCalledWith(
			"http://fake-radarr:7878/api/v3/movie/7",
			expect.anything(),
		);
		expect(sentQueries()).toContain("Byousoku 5 Centimeter");
		expect(body.files[0].filename).toBe("Byousoku.5.Centimeter.2007.720p.mkv");
	});

	it("still searches when the *Arr can't be asked", async () => {
		setSetting("radarrUrl", "http://fake-radarr:7878");
		setSetting("radarrApiKey", "k");
		axios.get.mockRejectedValueOnce(new Error("radarr down"));

		const res = await search({ query: "5cm", service: "radarr", serviceId: 7 });
		const body = await res.json();

		expect(res.status).toBe(200);
		expect(body.files[0].filename).toBe("5cm.2007.1080p.mkv");
	});

	it("searches every channel when none is given, tagging each result", async () => {
		mockTelegramClientInstance.getDialogs = vi.fn().mockResolvedValue([
			{ isChannel: true, id: 111n },
			{ isChannel: false, id: 222n },
			{ isChannel: true, id: 333n },
		]);
		const peers = new Set();
		mockTelegramClientInstance.invoke.mockImplementation(async (req) => {
			if (req?.peer) peers.add(req.peer);
			return telegramSearch(req);
		});
		mockTelegramClientInstance.getEntity.mockImplementation(async (id) => ({
			title: `Channel ${id}`,
			id,
		}));

		const res = await app.handle(
			new Request("http://localhost/api/v1/telegram/search", {
				method: "POST",
				headers: { Cookie: cookie, "Content-Type": "application/json" },
				body: JSON.stringify({ query: "5cm" }),
			}),
		);
		const body = await res.json();

		expect(res.status).toBe(200);
		expect(peers.size).toBe(2);
		expect(new Set(body.files.map((f) => f.channel))).toEqual(
			new Set(["111", "333"]),
		);
		// The name comes through the route, so the UI can say where each is from.
		expect(new Set(body.files.map((f) => f.channelTitle))).toEqual(
			new Set(["Channel 111", "Channel 333"]),
		);
		mockTelegramClientInstance.getEntity.mockResolvedValue({
			title: "Test channel",
		});
	});

	it("searches a few channels at once, and skips one that fails", async () => {
		mockTelegramClientInstance.getDialogs = vi
			.fn()
			.mockResolvedValue(
				Array.from({ length: 10 }, (_, i) => ({ isChannel: true, id: BigInt(i) })),
			);
		mockTelegramClientInstance.getEntity.mockImplementation(async (id) => ({
			title: `Channel ${id}`,
			id,
		}));
		let inFlight = 0;
		let most = 0;
		mockTelegramClientInstance.invoke.mockImplementation(async (req) => {
			if (String(req?.peer?.id) === "3") throw new Error("CHANNEL_PRIVATE");
			inFlight++;
			most = Math.max(most, inFlight);
			await new Promise((r) => setTimeout(r, 5));
			inFlight--;
			return telegramSearch(req);
		});

		const res = await app.handle(
			new Request("http://localhost/api/v1/telegram/search", {
				method: "POST",
				headers: { Cookie: cookie, "Content-Type": "application/json" },
				body: JSON.stringify({ query: "5cm" }),
			}),
		);
		const body = await res.json();

		expect(res.status).toBe(200);
		expect(most).toBeGreaterThan(1);
		expect(most).toBeLessThanOrEqual(4);
		const channels = new Set(body.files.map((f) => f.channel));
		expect(channels.size).toBe(9);
		expect(channels.has("3")).toBe(false);
		mockTelegramClientInstance.getEntity.mockResolvedValue({
			title: "Test channel",
		});
	});
});
