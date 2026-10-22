import { getPublicSettings, setSetting } from "../db";
import { resetTelegramClient } from "../telegram";
import { DEFAULT_SETTINGS } from "../config";
import { bumpTokenVersion } from "../session";
import { issueSession } from "./auth.service";

// Only keys present in the default settings can be written through the API.
// Internal keys (jwtSecret, isFirstTime, telegramSession, tokenVersion, ...)
// are set by the server directly and must never be reachable from a request body.
const ALLOWED_SETTING_KEYS = new Set(Object.keys(DEFAULT_SETTINGS));
const MIN_PASSWORD_LENGTH = 8;

// A new password revokes every session issued before it, then signs the
// caller back in so changing it doesn't log you out of this tab.
const changePassword = async (value, ctx) => {
	setSetting("password", await Bun.password.hash(String(value)));
	bumpTokenVersion();
	await issueSession({ ...ctx, rememberMe: false });
};

export const SettingsService = {
	getPublicSettings: () => {
		const publicSettings = getPublicSettings();
		return { success: true, settings: publicSettings };
	},

	postSettings: async ({ body: { key, value }, status, jwt, cookie, request }) => {
		if (!ALLOWED_SETTING_KEYS.has(key)) {
			return status(400, {
				success: false,
				message: `Setting '${key}' is not allowed`,
			});
		}

		if (key === "password") {
			if (typeof value !== "string" || value.length < MIN_PASSWORD_LENGTH) {
				return status(400, {
					success: false,
					message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
				});
			}
			await changePassword(value, { jwt, cookie, request });
			return { success: true, message: "Setting updated" };
		}

		setSetting(key, value);
		if (key.startsWith("telegram")) await resetTelegramClient();
		return { success: true, message: "Setting updated" };
	},

	postSettingsBatch: async ({ body, jwt, cookie, request }) => {
		for (const [key, value] of Object.entries(body)) {
			if (value === undefined || value === null || value === "") continue;
			if (!ALLOWED_SETTING_KEYS.has(key)) continue;

			if (key === "password") {
				// The model already enforces the minimum length here.
				await changePassword(value, { jwt, cookie, request });
				continue;
			}
			if (key.startsWith("telegram")) await resetTelegramClient();
			setSetting(key, value);
		}

		return { success: true, message: "Settings updated" };
	},
};
