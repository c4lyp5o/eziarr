import { describe, it, expect } from "vitest";
import { app } from "../index.js";

describe("Eziarr Core API Flows", () => {
	it("GET /api/v1 - Should return API health check", async () => {
		// 1. Send an in-memory request to the app
		const req = new Request("http://localhost/api/v1");
		const res = await app.handle(req);

		// 2. Parse the JSON response
		const body = await res.json();

		// 3. Assert the expected outcomes
		expect(res.status).toBe(200);
		expect(body.success).toBe(true);
		expect(body.message).toBe("Eziarr API is Running");
	});

	it("GET /api/v1/invalid-route - Should hit the 404 wildcard handler", async () => {
		const req = new Request("http://localhost/api/v1/this-does-not-exist");
		const res = await app.handle(req);
		const body = await res.json();

		expect(res.status).toBe(404);
		expect(body.success).toBe(false);
		expect(body.message).toBe("Not Found");
	});

	it("POST /api/v1/settings - Should fail TypeBox validation with missing keys", async () => {
		// We are intentionally sending a bad body (missing 'key' and 'value')
		const req = new Request("http://localhost/api/v1/settings", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ wrongKey: "test" }),
		});

		const res = await app.handle(req);
		const body = await res.json();

		// Should hit your .onError VALIDATION block!
		expect(res.status).toBe(400);
		expect(body.success).toBe(false);
		expect(body.message).toBe("Bad request data");
	});

	it("POST & GET /api/v1/settings - Should save and retrieve a setting", async () => {
		// 1. Save a test setting
		const postReq = new Request("http://localhost/api/v1/settings", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ key: "test_config_key", value: "vitest_rulez" }),
		});
		const postRes = await app.handle(postReq);
		const postBody = await postRes.json();

		expect(postRes.status).toBe(200);
		expect(postBody.success).toBe(true);

		// 2. Verify it actually saved to the SQLite DB
		const getReq = new Request("http://localhost/api/v1/settings");
		const getRes = await app.handle(getReq);
		const getBody = await getRes.json();

		expect(getRes.status).toBe(200);
		expect(getBody.settings.test_config_key).toBe("vitest_rulez");
	});
});
