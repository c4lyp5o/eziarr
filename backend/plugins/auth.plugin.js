import { Elysia } from "elysia";
import { verifyAccessToken } from "../session";

// Scoped so `isAdmin` reaches the routes of the guard that uses this plugin
// (see protector.plugin.js).
export const AuthPlugin = new Elysia({ name: "AuthPlugin" }).derive(
	{ as: "scoped" },
	async ({ jwt, cookie: c }) => {
		const payload = await verifyAccessToken(jwt, c.eziarr_access?.value);
		return { isAdmin: payload ? payload.isAdmin : null };
	},
);
