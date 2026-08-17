import { getSetting, setSetting } from "../db";
import { generalLogger as logger } from "../logger";
import { getClientIp } from "../utils";

const shouldSecureCookies = (request) => {
	// Explicit env override wins (COOKIE_SECURE=true/false)
	const envOverride = process.env.COOKIE_SECURE;
	if (envOverride !== undefined) return envOverride === "true";

	// Otherwise derive from the request: HTTPS directly or via a trusted reverse proxy
	const forwardedProto = request.headers.get("x-forwarded-proto");
	if (forwardedProto) return forwardedProto.split(",")[0].trim() === "https";

	return request.url.startsWith("https://");
};

function setAuthCookies({ cookie, accessToken, refreshToken, rememberMe, request }) {
	cookie.eziarr_access.set({
		value: accessToken,
		httpOnly: true,
		sameSite: "strict",
		secure: shouldSecureCookies(request),
		path: "/",
		maxAge: 60 * 15,
	});

	const refreshMaxAge = rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * 24;
	cookie.eziarr_refresh.set({
		value: refreshToken,
		httpOnly: true,
		sameSite: "strict",
		secure: shouldSecureCookies(request),
		path: "/api/v1",
		maxAge: refreshMaxAge,
	});
}

function clearAuthCookies({ cookie, request }) {
	cookie.eziarr_access.set({
		value: "",
		httpOnly: true,
		sameSite: "strict",
		secure: shouldSecureCookies(request),
		path: "/",
		maxAge: 0,
	});

	cookie.eziarr_refresh.set({
		value: "",
		httpOnly: true,
		sameSite: "strict",
		secure: shouldSecureCookies(request),
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

	postFirstTime: async ({ body: { password }, status }) => {
		const isFirstTime = getSetting("isFirstTime");
		if (isFirstTime === "false")
			return status(401, { success: false, message: "Unauthorized" });

		if (!password)
			return status(401, { success: false, message: "Unauthorized" });

		const hashedPassword = await Bun.password.hash(password);
		setSetting("password", hashedPassword);
		setSetting("isFirstTime", "false");

		return { success: true, message: "Setting updated." };
	},

	login: async ({
		request,
		server,
		jwt,
		cookie,
		body: { password, rememberMe },
		status,
	}) => {
		const isFirstTime = getSetting("isFirstTime");
		if (isFirstTime === "true" || isFirstTime === null)
			return status(401, { success: false, message: "Unauthorized" });

		if (!password) {
			logger.warn(
				`[AUTH] Failed login attempt from ${getClientIp(request, server)} - No password provided`,
			);
			return status(401, { success: false, message: "Unauthorized" });
		}

		const hashedPassword = getSetting("password");
		const comparePassword = await Bun.password.verify(password, hashedPassword);
		if (!comparePassword) {
			logger.warn(
				`[AUTH] Failed login attempt from ${getClientIp(request, server)}`,
			);
			return status(401, { success: false, message: "Unauthorized" });
		}

		const accessToken = await jwt.sign({ isAdmin: true }, { expiresIn: "15m" });
		const refreshExp = rememberMe ? "30d" : "1d";
		const refreshToken = await jwt.sign(
			{ isAdmin: true, type: "refresh" },
			{ expiresIn: refreshExp },
		);

		setAuthCookies({
			cookie,
			accessToken,
			refreshToken,
			rememberMe: !!rememberMe,
			request,
		});

		return { success: true };
	},

	me: async ({ request, server, jwt, cookie, status }) => {
		const isFirstTime = getSetting("isFirstTime");
		if (isFirstTime === "true" || isFirstTime === null)
			return status(401, { success: false, message: "Unauthorized" });

		const token = cookie.eziarr_access?.value;
		if (!token) return status(401, { success: false, message: "Unauthorized" });

		const payload = await jwt.verify(token);
		if (!payload || !payload.isAdmin) {
			logger.warn(
				`[AUTH] Unauthorized access attempt to /auth/me from ${getClientIp(request, server)}`,
			);
			return status(401, { success: false, message: "Unauthorized" });
		}

		return { success: true, isAdmin: payload.isAdmin };
	},

	refresh: async ({ request, server, jwt, cookie, status }) => {
		const isFirstTime = getSetting("isFirstTime");
		if (isFirstTime === "true" || isFirstTime === null)
			return status(401, { success: false, message: "Unauthorized" });

		const token = cookie.eziarr_refresh?.value;
		if (!token) return status(401, { success: false, message: "Unauthorized" });

		const payload = await jwt.verify(token);
		if (!payload || payload.type !== "refresh" || !payload.isAdmin) {
			logger.warn(
				`[AUTH] Unauthorized refresh attempt from ${getClientIp(request, server)}`,
			);
			return status(401, { success: false, message: "Unauthorized" });
		}

		const accessToken = await jwt.sign(
			{ isAdmin: payload.isAdmin },
			{ expiresIn: "15m" },
		);

		cookie.eziarr_access.set({
			value: accessToken,
			httpOnly: true,
			sameSite: "strict",
			secure: shouldSecureCookies(request),
			path: "/",
			maxAge: 60 * 15,
		});

		return { success: true };
	},

	logout: async ({ request, cookie }) => {
		clearAuthCookies({ cookie, request });
		return { success: true };
	},
};
