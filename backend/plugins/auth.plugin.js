import { Elysia } from "elysia";
import { verifyAccessToken } from "../session";

export const AuthPlugin = new Elysia({ name: "AuthPlugin" }).derive(
	async ({ jwt, cookie: c }) => {
		const payload = await verifyAccessToken(jwt, c.eziarr_access?.value);
		return { isAdmin: payload ? payload.isAdmin : null };
	},
);
