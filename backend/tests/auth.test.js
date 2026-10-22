import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../index.js";
import { setSetting } from "../db.js";
import { resetRateLimitBuckets } from "../plugins/rate-limit.plugin.js";
import { issueSetupCode, prepareSetup } from "../setup.js";
import { bumpTokenVersion } from "../session.js";

const json = (url, body, headers = {}) =>
	new Request(`http://localhost${url}`, {
		method: "POST",
		headers: { "Content-Type": "application/json", ...headers },
		body: JSON.stringify(body),
	});

const cookieFrom = (res, name) =>
	(res.headers.get("set-cookie") || "").match(
		new RegExp(`${name}=([^;, \\n]+)`),
	)?.[0] ?? "";

const loginAs = async (password = "testpass") => {
	setSetting("isFirstTime", "false");
	setSetting("password", await Bun.password.hash(password));
	const res = await app.handle(json("/api/v1/login", { password }));
	return {
		access: cookieFrom(res, "eziarr_access"),
		refresh: cookieFrom(res, "eziarr_refresh"),
	};
};

const me = (cookie) =>
	app.handle(new Request("http://localhost/api/v1/me", { headers: { Cookie: cookie } }));

describe("Authentication & Cookie Lifecycle Flow", () => {
	beforeEach(() => {
		resetRateLimitBuckets();
		setSetting("isFirstTime", "true");
		setSetting("password", "");
	});

	it("GET /api/v1/firsttime - Should return isFirstTime: true on fresh boot", async () => {
		const req = new Request("http://localhost/api/v1/firsttime");
		const res = await app.handle(req);
		const body = await res.json();

		expect(res.status).toBe(200);
		expect(body.success).toBe(true);
		expect(body.isFirstTime).toBe(true);
	});

	it("POST /api/v1/firsttime - Should save credentials and lock setup", async () => {
		const req = new Request("http://localhost/api/v1/firsttime", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ password: "securepassword", setupCode: issueSetupCode() }),
		});
		const res = await app.handle(req);
		const body = await res.json();

		expect(res.status).toBe(200);
		expect(body.success).toBe(true);

		const checkReq = new Request("http://localhost/api/v1/firsttime");
		const checkRes = await app.handle(checkReq);
		const checkBody = await checkRes.json();

		expect(checkBody.isFirstTime).toBe(false);
	});

	it("POST /api/v1/login - Should fail with wrong credentials", async () => {
		setSetting("isFirstTime", "false");
		setSetting("password", await Bun.password.hash("correctpassword"));

		const req = new Request("http://localhost/api/v1/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ password: "wrongpassword" }),
		});

		const res = await app.handle(req);
		const body = await res.json();

		expect(res.status).toBe(401);
		expect(body.success).toBe(false);
	});

	it("POST /api/v1/login - Should succeed and set HttpOnly Cookies", async () => {
		setSetting("isFirstTime", "false");
		setSetting("password", await Bun.password.hash("correctpassword"));

		const req = new Request("http://localhost/api/v1/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				password: "correctpassword",
				rememberMe: true,
			}),
		});

		const res = await app.handle(req);
		const body = await res.json();

		expect(res.status).toBe(200);
		expect(body.success).toBe(true);

		const cookies = res.headers.get("set-cookie");
		expect(cookies).toContain("eziarr_access=");
		expect(cookies).toContain("eziarr_refresh=");
	});

	it("GET /api/v1/me - Should decode cookie and return admin status", async () => {
		setSetting("isFirstTime", "false");
		setSetting("password", await Bun.password.hash("testpass"));

		const loginReq = new Request("http://localhost/api/v1/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ password: "testpass" }),
		});
		const loginRes = await app.handle(loginReq);
		const rawSetCookie = loginRes.headers.get("set-cookie") || "";

		const accessMatch = rawSetCookie.match(/eziarr_access=([^;, \n]+)/);
		const cookieHeader = accessMatch ? accessMatch[0] : "";

		const req = new Request("http://localhost/api/v1/me", {
			headers: { Cookie: cookieHeader },
		});
		const res = await app.handle(req);
		const body = await res.json();

		expect(res.status).toBe(200);
		expect(body.success).toBe(true);
		expect(body.isAdmin).toBe(true);
	});

	it("POST /api/v1/refresh - Should issue a new access token from refresh cookie", async () => {
		setSetting("isFirstTime", "false");
		setSetting("password", await Bun.password.hash("testpass"));

		const loginReq = new Request("http://localhost/api/v1/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ password: "testpass" }),
		});
		const loginRes = await app.handle(loginReq);
		const rawSetCookie = loginRes.headers.get("set-cookie") || "";

		const refreshMatch = rawSetCookie.match(/eziarr_refresh=([^;, \n]+)/);
		const cookieHeader = refreshMatch ? refreshMatch[0] : "";

		const req = new Request("http://localhost/api/v1/refresh", {
			method: "POST",
			headers: { Cookie: cookieHeader },
		});
		const res = await app.handle(req);
		const body = await res.json();

		expect(res.status).toBe(200);
		expect(body.success).toBe(true);
		expect(res.headers.get("set-cookie")).toContain("eziarr_access=");
	});

	it("GET /api/v1/me - Should return 401 for an invalid access token instead of crashing", async () => {
		setSetting("isFirstTime", "false");

		const req = new Request("http://localhost/api/v1/me", {
			headers: { Cookie: "eziarr_access=not.a.valid.token" },
		});
		const res = await app.handle(req);
		const body = await res.json();

		expect(res.status).toBe(401);
		expect(body.success).toBe(false);
	});

	it("POST /api/v1/refresh - Should return 401 for an invalid refresh token instead of crashing", async () => {
		setSetting("isFirstTime", "false");

		const req = new Request("http://localhost/api/v1/refresh", {
			method: "POST",
			headers: { Cookie: "eziarr_refresh=not.a.valid.token" },
		});
		const res = await app.handle(req);
		const body = await res.json();

		expect(res.status).toBe(401);
		expect(body.success).toBe(false);
	});

	it("POST /api/v1/login - Should issue non-secure cookies over plain http", async () => {
		setSetting("isFirstTime", "false");
		setSetting("password", await Bun.password.hash("testpass"));

		const req = new Request("http://localhost/api/v1/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ password: "testpass" }),
		});
		const res = await app.handle(req);
		const cookies = res.headers.get("set-cookie") || "";

		expect(res.status).toBe(200);
		expect(cookies).toContain("eziarr_access=");
		expect(cookies).not.toContain("Secure");
	});

	it("POST /api/v1/login - Should issue secure cookies when COOKIE_SECURE=true", async () => {
		setSetting("isFirstTime", "false");
		setSetting("password", await Bun.password.hash("testpass"));

		const oldOverride = process.env.COOKIE_SECURE;
		process.env.COOKIE_SECURE = "true";

		try {
			const req = new Request("http://localhost/api/v1/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ password: "testpass" }),
			});
			const res = await app.handle(req);
			const cookies = res.headers.get("set-cookie") || "";

			expect(res.status).toBe(200);
			expect(cookies).toContain("Secure");
		} finally {
			if (oldOverride === undefined) delete process.env.COOKIE_SECURE;
			else process.env.COOKIE_SECURE = oldOverride;
		}
	});

	it("POST /api/v1/login - Should rate limit after 10 attempts per minute", async () => {
		resetRateLimitBuckets();
		setSetting("isFirstTime", "false");
		setSetting("password", await Bun.password.hash("testpass"));

		let lastStatus = 0;
		for (let i = 0; i < 12; i++) {
			const req = new Request("http://localhost/api/v1/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ password: "wrongpass" }),
			});
			const res = await app.handle(req);
			lastStatus = res.status;
		}

		expect(lastStatus).toBe(429);
	});

	it("POST /api/v1/logout - Should destroy the session cookies", async () => {
		const req = new Request("http://localhost/api/v1/logout", {
			method: "POST",
			headers: { Cookie: "eziarr_access=fake; eziarr_refresh=fake" },
		});
		const res = await app.handle(req);
		const body = await res.json();

		expect(res.status).toBe(200);
		expect(body.success).toBe(true);

		const cookies = res.headers.get("set-cookie") || "";

		expect(cookies).toContain("eziarr_access=");
		expect(cookies).toContain("eziarr_refresh=");
	});

	// --- First-boot setup code (security sweep #3) ---
	it("POST /api/v1/firsttime - Should refuse setup without the server's setup code", async () => {
		issueSetupCode();
		const res = await app.handle(
			json("/api/v1/firsttime", { password: "securepassword", setupCode: "AAAA-AAAA" }),
		);
		expect(res.status).toBe(401);

		const missing = await app.handle(
			json("/api/v1/firsttime", { password: "securepassword" }),
		);
		expect(missing.status).toBe(400);

		const check = await (await app.handle(new Request("http://localhost/api/v1/firsttime"))).json();
		expect(check.isFirstTime).toBe(true);
	});

	it("POST /api/v1/firsttime - Should accept the code in any case, once", async () => {
		const code = issueSetupCode();
		const loose = code.replace("-", " ").toLowerCase();
		const res = await app.handle(
			json("/api/v1/firsttime", { password: "securepassword", setupCode: loose }),
		);
		expect(res.status).toBe(200);

		// Setup is done and the code is spent: a replay is refused.
		setSetting("isFirstTime", "true");
		const replay = await app.handle(
			json("/api/v1/firsttime", { password: "attackerpass", setupCode: code }),
		);
		expect(replay.status).toBe(401);
	});

	it("prepareSetup - Should complete setup from EZIARR_PASSWORD and refuse a short one", async () => {
		process.env.EZIARR_PASSWORD = "short";
		await expect(prepareSetup()).rejects.toThrow(/at least 8/);

		process.env.EZIARR_PASSWORD = "from-the-environment";
		expect(await prepareSetup()).toBe(null);
		delete process.env.EZIARR_PASSWORD;

		const check = await (await app.handle(new Request("http://localhost/api/v1/firsttime"))).json();
		expect(check.isFirstTime).toBe(false);
		const login = await app.handle(json("/api/v1/login", { password: "from-the-environment" }));
		expect(login.status).toBe(200);
	});

	// --- Session revocation (security sweep #2, #4) ---
	it("GET /api/v1/me - Should refuse a refresh token used as an access token", async () => {
		const { refresh } = await loginAs();
		const asAccess = refresh.replace("eziarr_refresh=", "eziarr_access=");
		expect((await me(asAccess)).status).toBe(401);
	});

	it("Should revoke every existing session when the session version moves", async () => {
		const { access, refresh } = await loginAs();
		expect((await me(access)).status).toBe(200);

		bumpTokenVersion();

		expect((await me(access)).status).toBe(401);
		const refreshed = await app.handle(
			new Request("http://localhost/api/v1/refresh", {
				method: "POST",
				headers: { Cookie: refresh },
			}),
		);
		expect(refreshed.status).toBe(401);
	});

	it("POST /api/v1/settings/batch - Should revoke other sessions on a password change but keep the caller signed in", async () => {
		const other = await loginAs("testpass");
		const mine = await loginAs("testpass");

		const res = await app.handle(
			json(
				"/api/v1/settings/batch",
				{ password: "brand-new-pass", syncEnabled: true, hunterEnabled: true, syncInterval: 10, hunterInterval: 15 },
				{ Cookie: mine.access },
			),
		);
		expect(res.status).toBe(200);

		expect((await me(other.access)).status).toBe(401);
		expect((await me(mine.access)).status).toBe(401);
		const fresh = cookieFrom(res, "eziarr_access");
		expect((await me(fresh)).status).toBe(200);
	});

	it("POST /api/v1/settings - Should refuse a password under 8 characters", async () => {
		const { access } = await loginAs();
		const res = await app.handle(
			json("/api/v1/settings", { key: "password", value: "short" }, { Cookie: access }),
		);
		expect(res.status).toBe(400);
		const login = await app.handle(json("/api/v1/login", { password: "testpass" }));
		expect(login.status).toBe(200);
	});
});
