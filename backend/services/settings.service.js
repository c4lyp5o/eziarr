import { getPublicSettings, setSetting } from "../db";
import { resetTelegramClient } from "../telegram";
import { DEFAULT_SETTINGS } from "../config";

// Only keys present in the default settings can be written through the API.
// Internal keys (jwtSecret, isFirstTime, telegramSession, ...) are set by the
// server directly and must never be reachable from a request body.
const ALLOWED_SETTING_KEYS = new Set(Object.keys(DEFAULT_SETTINGS));

export const SettingsService = {
	getPublicSettings: () => {
		const publicSettings = getPublicSettings();
		return { success: true, settings: publicSettings };
	},

	postSettings: async ({ body: { key, value }, status }) => {
		if (!ALLOWED_SETTING_KEYS.has(key)) {
			return status(400, {
				success: false,
				message: `Setting '${key}' is not allowed`,
			});
		}

		let finalValue = value;
		if (key === "password") finalValue = await Bun.password.hash(String(value));

		setSetting(key, finalValue);
		if (key.startsWith("telegram")) await resetTelegramClient();
		return { success: true, message: "Setting updated" };
	},

	postSettingsBatch: async ({ body }) => {
		for (const [key, value] of Object.entries(body)) {
			if (value === undefined || value === null || value === "") continue;
			if (!ALLOWED_SETTING_KEYS.has(key)) continue;

			let finalValue = value;
			if (key === "password") finalValue = await Bun.password.hash(String(value));
			if (key.startsWith("telegram")) await resetTelegramClient();
			setSetting(key, finalValue);
		}

		return { success: true, message: "Settings updated" };
	},
};
