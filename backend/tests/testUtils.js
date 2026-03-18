import { app } from "../index.js";
import { setSetting } from "../db.js";

export const getAuthCookie = async () => {
	setSetting("isFirstTime", "false");
	setSetting("username", "admin");
	setSetting("password", "testpass");

	const req = new Request("http://localhost/api/v1/login", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ username: "admin", password: "testpass" }),
	});

	const res = await app.handle(req);
	const cookies = res.headers.get("set-cookie");

	const match = cookies?.match(/eziarr_access=([^;]+)/);
	return match ? `eziarr_access=${match[1]}` : "";
};
