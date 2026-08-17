import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../index.js";
import { setSetting } from "../db.js";

describe("Authentication & Cookie Lifecycle Flow", () => {
	beforeEach(() => {
		setSetting("isFirstTime", "true");
		setSetting("username", "");
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
			body: JSON.stringify({ username: "admin", password: "securepassword" }),
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
		setSetting("username", "admin");
		setSetting("password", await Bun.password.hash("correctpassword"));

		const req = new Request("http://localhost/api/v1/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ username: "admin", password: "wrongpassword" }),
		});

		const res = await app.handle(req);
		const body = await res.json();

		expect(res.status).toBe(401);
		expect(body.success).toBe(false);
	});

	it("POST /api/v1/login - Should succeed and set HttpOnly Cookies", async () => {
		setSetting("isFirstTime", "false");
		setSetting("username", "admin");
		setSetting("password", await Bun.password.hash("correctpassword"));

		const req = new Request("http://localhost/api/v1/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				username: "admin",
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
		setSetting("username", "admin");
		setSetting("password", await Bun.password.hash("testpass"));

		const loginReq = new Request("http://localhost/api/v1/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ username: "admin", password: "testpass" }),
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
		setSetting("username", "admin");
		setSetting("password", await Bun.password.hash("testpass"));

		const loginReq = new Request("http://localhost/api/v1/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ username: "admin", password: "testpass" }),
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
		setSetting("username", "admin");
		setSetting("password", await Bun.password.hash("testpass"));

		const req = new Request("http://localhost/api/v1/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ username: "admin", password: "testpass" }),
		});
		const res = await app.handle(req);
		const cookies = res.headers.get("set-cookie") || "";

		expect(res.status).toBe(200);
		expect(cookies).toContain("eziarr_access=");
		expect(cookies).not.toContain("Secure");
	});

	it("POST /api/v1/login - Should issue secure cookies when COOKIE_SECURE=true", async () => {
		setSetting("isFirstTime", "false");
		setSetting("username", "admin");
		setSetting("password", await Bun.password.hash("testpass"));

		const oldOverride = process.env.COOKIE_SECURE;
		process.env.COOKIE_SECURE = "true";

		try {
			const req = new Request("http://localhost/api/v1/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ username: "admin", password: "testpass" }),
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
});
