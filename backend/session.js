import { getSetting, setSetting } from "./db";

// Every token carries the session version it was issued under (`tv`).
// Bumping the version (on a password change) invalidates every token issued
// before it, access and refresh alike, without touching the JWT secret.
// Tokens minted before versions existed carry no `tv` and count as 0.
export const getTokenVersion = () => Number(getSetting("tokenVersion", 0)) || 0;

export const bumpTokenVersion = () => {
	const next = getTokenVersion() + 1;
	setSetting("tokenVersion", next);
	return next;
};

const isCurrent = (payload) => Number(payload?.tv ?? 0) === getTokenVersion();

/** Payload of a valid access token, or null. Refresh tokens are refused. */
export const verifyAccessToken = async (jwt, token) => {
	if (!token) return null;
	try {
		const payload = await jwt.verify(token);
		if (!payload?.isAdmin || payload.type === "refresh" || !isCurrent(payload))
			return null;
		return payload;
	} catch {
		return null;
	}
};

/** Payload of a valid refresh token, or null. */
export const verifyRefreshToken = async (jwt, token) => {
	if (!token) return null;
	try {
		const payload = await jwt.verify(token);
		if (!payload?.isAdmin || payload.type !== "refresh" || !isCurrent(payload))
			return null;
		return payload;
	} catch {
		return null;
	}
};
