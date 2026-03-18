import { Elysia } from "elysia";

export const AuthPlugin = new Elysia({ name: "AuthPlugin" }).derive(
	{ as: "scoped" },
	async ({ jwt, cookie: c }) => {
		// console.log("[AuthPlugin] cookie", c);
		const token = c.eziarr_access?.value;
		if (!token) return { user: null };

		try {
			const payload = await jwt.verify(token);
			if (!payload?.username) return { user: null };
			return { user: { username: payload.username } };
		} catch {
			return { user: null };
		}
	},
);
