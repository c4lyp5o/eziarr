import { describe, it, expect, beforeAll } from "vitest";
import { app } from "../index.js";
import { getAuthCookie } from "./testUtils.js";

describe("Eziarr Core API Flows", () => {
	let authCookie = "";

	beforeAll(async () => {
		authCookie = await getAuthCookie();
	});

	it("GET /api/v1 - Should return API health check (Public Route)", async () => {
		const req = new Request("http://localhost/api/v1");
		const res = await app.handle(req);
		const body = await res.json();

		expect(res.status).toBe(200);
		expect(body.success).toBe(true);
	});

	it("GET /api/v1/invalid-route - Should hit the 404 wildcard handler", async () => {
		const req = new Request("http://localhost/api/v1/this-does-not-exist", {
			headers: {
				"Content-Type": "application/json",
				Cookie: authCookie,
			},
		});
		const res = await app.handle(req);
		const body = await res.json();

		expect(res.status).toBe(404);
		expect(body.success).toBe(false);
	});

	it("POST & GET /api/v1/settings - Should save and retrieve a setting (Protected Route)", async () => {
		const postReq = new Request("http://localhost/api/v1/settings", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Cookie: authCookie,
			},
			body: JSON.stringify({ key: "syncEnabled", value: false }),
		});
		const postRes = await app.handle(postReq);
		const postBody = await postRes.json();

		expect(postRes.status).toBe(200);
		expect(postBody.success).toBe(true);

		const getReq = new Request("http://localhost/api/v1/settings", {
			headers: {
				"Content-Type": "application/json",
				Cookie: authCookie,
			},
		});
		const getRes = await app.handle(getReq);
		const getBody = await getRes.json();

		expect(getRes.status).toBe(200);
		expect(getBody.settings.syncEnabled).toBe(false);
	});

	it("POST /api/v1/settings - Should reject unknown keys (mass assignment guard)", async () => {
		const postReq = new Request("http://localhost/api/v1/settings", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Cookie: authCookie,
			},
			body: JSON.stringify({ key: "isFirstTime", value: "true" }),
		});
		const postRes = await app.handle(postReq);
		const postBody = await postRes.json();

		expect(postRes.status).toBe(400);
		expect(postBody.success).toBe(false);
	});
});
