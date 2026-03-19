import { Elysia } from "elysia";

export const ProtectorPlugin = new Elysia({
	name: "ProtectorPlugin",
}).onBeforeHandle({ as: "scoped" }, ({ user, set }) => {
	if (!user) {
		set.status = 401;
		return { success: false, message: "Unauthorized" };
	}
});
