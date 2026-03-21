import { Elysia } from "elysia";

export const AuthPlugin = new Elysia({ name: "AuthPlugin" }).derive(
	async ({ jwt, cookie: c }) => {
		const token = c.eziarr_access?.value;
		if (!token) return { isAdmin: null };

		try {
			const payload = await jwt.verify(token);
			if (!payload?.isAdmin) return { isAdmin: null };
			return { isAdmin: payload.isAdmin };
		} catch {
			return { isAdmin: null };
		}
	},
);
