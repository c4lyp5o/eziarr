import { Elysia } from "elysia";

// `as: "scoped"` is what makes this protect anything: Elysia hooks are local
// to the plugin that declares them unless scoped, so without it this check
// never ran for the routes beside it and every API route was public.
// tests/protected-routes.test.js walks every route to keep it that way.
export const ProtectorPlugin = new Elysia({
	name: "ProtectorPlugin",
}).onBeforeHandle({ as: "scoped" }, ({ isAdmin, set }) => {
	if (!isAdmin) {
		set.status = 401;
		return { success: false, message: "Unauthorized" };
	}
});
