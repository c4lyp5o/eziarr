import { getSetting, setSetting } from "../db";

function setAuthCookies({ cookie, accessToken, refreshToken, rememberMe }) {
	cookie.eziarr_access.set({
		value: accessToken,
		httpOnly: true,
		sameSite: "lax",
		secure: !process.env.NODE_ENV === "dev",
		path: "/",
		maxAge: 60 * 15,
	});

	const refreshMaxAge = rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * 24;
	cookie.eziarr_refresh.set({
		value: refreshToken,
		httpOnly: true,
		sameSite: "lax",
		secure: !process.env.NODE_ENV === "dev",
		path: "/api/v1",
		maxAge: refreshMaxAge,
	});
}

function clearAuthCookies({ cookie }) {
	cookie.eziarr_access.set({
		value: "",
		httpOnly: true,
		sameSite: "lax",
		secure: !process.env.NODE_ENV === "dev",
		path: "/",
		maxAge: 0,
	});

	cookie.eziarr_refresh.set({
		value: "",
		httpOnly: true,
		sameSite: "lax",
		secure: !process.env.NODE_ENV === "dev",
		path: "/api/v1",
		maxAge: 0,
	});
}

export const AuthService = {
	getFirstTime: () => {
		let isFirstTime = getSetting("isFirstTime");
		isFirstTime = !!(isFirstTime === null || isFirstTime === "true");
		return { success: true, isFirstTime };
	},

	postFirstTime: async ({ body: { username, password } }) => {
		if (!username || !password) throw new Error("Unauthorized");

		const isFirstTime = getSetting("isFirstTime");
		if (isFirstTime === "false") throw new Error("Unauthorized");

		setSetting("username", username);
		setSetting("password", password);
		setSetting("isFirstTime", "false");

		return { success: true, message: "Setting updated." };
	},

	login: async ({
		jwt,
		cookie,
		body: { username, password, rememberMe },
		set,
	}) => {
		const isFirstTime = getSetting("isFirstTime");
		if (isFirstTime === "true" || isFirstTime === null) {
			set.status = 401;
			return { success: false, message: "Unauthorized" };
		}

		if (!username || !password) {
			set.status = 401;
			return { success: false, message: "Unauthorized" };
		}

		const usr = getSetting("username");
		const pass = getSetting("password");
		if (username !== usr || password !== pass) {
			set.status = 401;
			return { success: false, message: "Unauthorized" };
		}

		const accessToken = await jwt.sign({ username }, { expiresIn: "15m" });
		const refreshExp = rememberMe ? "30d" : "1d";
		const refreshToken = await jwt.sign(
			{ username, type: "refresh" },
			{ expiresIn: refreshExp },
		);

		setAuthCookies({
			cookie,
			accessToken,
			refreshToken,
			rememberMe: !!rememberMe,
		});

		return { success: true };
	},

	me: async ({ jwt, cookie, set }) => {
		const isFirstTime = getSetting("isFirstTime");
		if (isFirstTime === "true" || isFirstTime === null) {
			set.status = 401;
			return { success: false, message: "Unauthorized" };
		}

		const token = cookie.eziarr_access?.value;
		if (!token) {
			set.status = 401;
			return { success: false, message: "Unauthorized" };
		}

		const payload = await jwt.verify(token);
		if (!payload?.username) {
			set.status = 401;
			return { success: false, message: "Unauthorized" };
		}

		return { success: true, user: { username: payload.username } };
	},

	refresh: async ({ jwt, cookie, set }) => {
		const isFirstTime = getSetting("isFirstTime");
		if (isFirstTime === "true" || isFirstTime === null) {
			set.status = 401;
			return { success: false, message: "Unauthorized" };
		}

		const token = cookie.eziarr_refresh?.value;
		if (!token) {
			set.status = 401;
			return { success: false, message: "Unauthorized" };
		}

		const payload = await jwt.verify(token);
		if (!payload || payload.type !== "refresh" || !payload.username) {
			set.status = 401;
			return { success: false, message: "Unauthorized" };
		}

		const accessToken = await jwt.sign(
			{ username: payload.username },
			{ expiresIn: "15m" },
		);

		cookie.eziarr_access.set({
			value: accessToken,
			httpOnly: true,
			sameSite: "lax",
			secure: !process.env.NODE_ENV === "dev",
			path: "/",
			maxAge: 60 * 15,
		});

		return { success: true };
	},

	logout: async ({ cookie }) => {
		clearAuthCookies({ cookie });
		return { success: true };
	},
};
