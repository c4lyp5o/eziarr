import { vi, describe, it, expect, beforeAll, beforeEach } from "vitest";
import { app } from "../index.js";
import { setSetting } from "../db.js";
import { getAuthCookie } from "./testUtils.js";

const mockTelegramClientInstance = {
	connect: vi.fn().mockResolvedValue(true),
	sendCode: vi.fn().mockResolvedValue({ phoneCodeHash: "fake_hash_123" }),
	invoke: vi.fn().mockResolvedValue(true),
	signInWithPassword: vi.fn().mockResolvedValue(true),
	session: { save: vi.fn().mockReturnValue("fake_session_string") },
};

vi.mock("telegram", () => {
	return {
		TelegramClient: vi.fn(() => mockTelegramClientInstance),
		Api: {
			auth: { SignIn: vi.fn() },
		},
	};
});

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
		setSetting("telegram_temp_hash", "fake_hash_123");
		setSetting("telegram_temp_phone", "+1234567890");

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
