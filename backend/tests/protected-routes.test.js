import { describe, it, expect, beforeAll } from "vitest";
import { app } from "../index.js";
import { getAuthCookie } from "./testUtils.js";

// Every /api route except these must refuse a request with no session.
// The plugin hooks once ran only inside their own plugin, which left every
// "protected" route public, including the password change. This walks the
// real route table, so a new route is covered the day it is added.
const PUBLIC = new Set([
	"GET /api/v1",
	"GET /api/v1/firsttime",
	"POST /api/v1/firsttime",
	"POST /api/v1/login",
	"GET /api/v1/me",
	"POST /api/v1/refresh",
	"POST /api/v1/logout",
]);

const apiRoutes = () =>
	app.routes
		.filter((r) => r.path.startsWith("/api/") || r.path === "/api/v1")
		.map((r) => ({ method: r.method, path: r.path.replace(/:(\w+)/g, "x") }));

const call = (method, path, cookie) =>
	app.handle(
		new Request(`http://localhost${path}`, {
			method,
			headers: {
				"Content-Type": "application/json",
				...(cookie ? { Cookie: cookie } : {}),
			},
			body: method === "GET" || method === "HEAD" ? undefined : "{}",
		}),
	);

describe("Every protected API route requires a session", () => {
	let cookie = "";
	beforeAll(async () => {
		cookie = await getAuthCookie();
	});

	it("Should have found the protected routes", () => {
		const protectedRoutes = apiRoutes().filter((r) => !PUBLIC.has(`${r.method} ${r.path}`));
		expect(protectedRoutes.length).toBeGreaterThan(20);
	});

	it("Should answer 401 to every protected route without a session", async () => {
		const open = [];
		for (const r of apiRoutes()) {
			if (PUBLIC.has(`${r.method} ${r.path}`)) continue;
			const res = await call(r.method, r.path);
			// Elysia validates the body before onBeforeHandle, so an empty body
			// can be refused as 400 by validation first. That still means the
			// handler never ran; a 400 from the handler itself would not.
			const body = await res.json().catch(() => ({}));
			const refused =
				res.status === 401 ||
				(res.status === 400 && body.message === "Bad request");
			if (!refused) open.push(`${r.method} ${r.path} -> ${res.status}`);
		}
		expect(open).toEqual([]);
	});

	it("Should let a signed-in session through", async () => {
		const res = await call("GET", "/api/v1/settings", cookie);
		expect(res.status).toBe(200);
	});

	// The exploit itself: a well-formed request that used to set a new password.
	it("Should refuse a valid unauthenticated password change", async () => {
		const res = await app.handle(
			new Request("http://localhost/api/v1/settings/batch", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					password: "attacker-password",
					syncEnabled: true,
					hunterEnabled: true,
					syncInterval: 10,
					hunterInterval: 15,
				}),
			}),
		);
		expect(res.status).toBe(401);

		const login = await app.handle(
			new Request("http://localhost/api/v1/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ password: "attacker-password" }),
			}),
		);
		expect(login.status).toBe(401);
	});
});
