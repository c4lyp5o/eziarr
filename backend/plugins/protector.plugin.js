import { Elysia } from "elysia";

export const ProtectorPlugin = new Elysia({
	name: "ProtectorPlugin",
}).onBeforeHandle(({ isAdmin, set }) => {
	if (!isAdmin) {
		set.status = 401;
		return { success: false, message: "Unauthorized" };
	}
});
