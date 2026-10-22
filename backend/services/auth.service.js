import { getSetting } from "../db";
import { generalLogger as logger } from "../logger";
import { getClientIp } from "../utils";
import {
	getTokenVersion,
	verifyAccessToken,
	verifyRefreshToken,
} from "../session";
import { isFirstTime, checkSetupCode, completeSetup } from "../setup";

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

/**
 * Sign a fresh access/refresh pair under the current session version and set
 * the cookies. Used by login, and after a password change so the person who
 * changed it stays signed in while every other session is revoked.
 */
export const issueSession = async ({ jwt, cookie, request, rememberMe }) => {
	const tv = getTokenVersion();
	const accessToken = await jwt.sign({ isAdmin: true, tv }, { expiresIn: "15m" });
	const refreshToken = await jwt.sign(
		{ isAdmin: true, type: "refresh", tv },
		{ expiresIn: rememberMe ? "30d" : "1d" },
	);
	setAuthCookies({ cookie, accessToken, refreshToken, rememberMe, request });
};

export const AuthService = {
	getFirstTime: () => {
		return { success: true, isFirstTime: isFirstTime() };
	},

	postFirstTime: async ({ request, server, body: { password, setupCode }, status }) => {
		if (!isFirstTime())
			return status(401, { success: false, message: "Unauthorized" });

		// The one-time code printed on the server's console proves the caller
		// owns this install (see setup.js).
		if (!checkSetupCode(setupCode)) {
			logger.warn(
				`[AUTH] Wrong setup code from ${getClientIp(request, server)}`,
			);
			return status(401, {
				success: false,
				message: "That setup code isn't right. Check the server log.",
			});
		}

		await completeSetup(password);

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
		if (isFirstTime())
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

		await issueSession({ jwt, cookie, request, rememberMe: !!rememberMe });

		return { success: true };
	},

	me: async ({ request, server, jwt, cookie, status }) => {
		if (isFirstTime())
			return status(401, { success: false, message: "Unauthorized" });

		const token = cookie.eziarr_access?.value;
		if (!token) return status(401, { success: false, message: "Unauthorized" });

		const payload = await verifyAccessToken(jwt, token);
		if (!payload) {
			logger.warn(
				`[AUTH] Unauthorized access attempt to /auth/me from ${getClientIp(request, server)}`,
			);
			return status(401, { success: false, message: "Unauthorized" });
		}

		return { success: true, isAdmin: payload.isAdmin };
	},

	refresh: async ({ request, server, jwt, cookie, status }) => {
		if (isFirstTime())
			return status(401, { success: false, message: "Unauthorized" });

		const token = cookie.eziarr_refresh?.value;
		if (!token) return status(401, { success: false, message: "Unauthorized" });

		const payload = await verifyRefreshToken(jwt, token);
		if (!payload) {
			logger.warn(
				`[AUTH] Unauthorized refresh attempt from ${getClientIp(request, server)}`,
			);
			return status(401, { success: false, message: "Unauthorized" });
		}

		const accessToken = await jwt.sign(
			{ isAdmin: payload.isAdmin, tv: getTokenVersion() },
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
