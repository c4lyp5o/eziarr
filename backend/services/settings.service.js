import { getPublicSettings, setSetting } from "../db";
import { resetTelegramClient } from "../telegram";

export const SettingsService = {
	getPublicSettings: () => {
		const publicSettings = getPublicSettings();
		return { success: true, settings: publicSettings };
	},

	postSettings: async ({ body: { key, value } }) => {
		setSetting(key, value);
		if (key.startsWith("telegram")) await resetTelegramClient();
		return { success: true, message: "Setting updated" };
	},

	postSettingsBatch: async ({ body }) => {
		for (const [key, value] of Object.entries(body)) {
			if (value === undefined || value === null || value === "") continue;

			let finalValue = value;

			if (key === "password") finalValue = await Bun.password.hash(value);
			if (key.startsWith("telegram")) await resetTelegramClient();
			setSetting(key, finalValue);
		}

		return { success: true, message: "Settings updated" };
	},
};
