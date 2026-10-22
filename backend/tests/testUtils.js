import { app } from "../index.js";
import { setSetting } from "../db.js";
import { resetRateLimitBuckets } from "../plugins/rate-limit.plugin.js";

export const getAuthCookie = async () => {
	setSetting("isFirstTime", "false");
	setSetting("password", await Bun.password.hash("testpass"));
	// Every test file signs in, and a full run is quicker than the login
	// limit's one-minute window (10 attempts).
	resetRateLimitBuckets();

	const req = new Request("http://localhost/api/v1/login", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ password: "testpass" }),
	});

	const res = await app.handle(req);
	const cookies = res.headers.get("set-cookie");

	const match = cookies?.match(/eziarr_access=([^;]+)/);
	if (!match) throw new Error(`Test login failed: HTTP ${res.status}`);
	return `eziarr_access=${match[1]}`;
};
