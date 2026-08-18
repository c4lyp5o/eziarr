import { t } from "elysia";

export const AuthModel = {
	// bodies
	postFirstTime: t.Object({
		password: t.String({ minLength: 8 }),
	}),
	login: t.Object({
		password: t.String({ minLength: 8 }),
		rememberMe: t.Optional(t.Boolean()),
	}),

	// responses
	getFirstTimeResponse: t.Object({
		success: t.Boolean(),
		isFirstTime: t.Boolean(),
	}),
	postFirstTimeResponse: t.Object({
		success: t.Boolean(),
		message: t.String(),
	}),
	loginResponse: t.Object({
		success: t.Boolean(),
		message: t.Optional(t.String()),
	}),
	meResponse: t.Object({
		success: t.Boolean(),
		isAdmin: t.Boolean(),
		message: t.Optional(t.String()),
	}),
	refreshResponse: t.Object({
		success: t.Boolean(),
		message: t.Optional(t.String()),
	}),
	logoutResponse: t.Object({
		success: t.Boolean(),
	}),
};
