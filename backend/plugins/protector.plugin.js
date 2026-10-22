import { Elysia } from "elysia";

// Refuses every request without a valid session before anything else runs.
//
// - `as: "scoped"` is what makes this protect anything: Elysia hooks are
//   local to the plugin that declares them unless scoped, so without it the
//   check never ran and every API route was public.
// - It runs at transform, i.e. before body validation, so a caller without
//   a session always gets 401 and learns nothing about the route's schema.
//   (AuthPlugin's derive also runs at transform and is registered first, so
//   `isAdmin` is already set.)
//
// tests/protected-routes.test.js walks every route to keep it that way.
export const ProtectorPlugin = new Elysia({
	name: "ProtectorPlugin",
}).onTransform({ as: "scoped" }, ({ isAdmin, status }) => {
	if (!isAdmin) throw status(401, { success: false, message: "Unauthorized" });
});
