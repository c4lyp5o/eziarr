import { getAllSettings, setSetting } from "../db";
import { resetTelegramClient } from "../telegram"; // <--- FIXED MISSING IMPORT

export const SettingsService = {
	getSettings: () => {
		const allSettings = getAllSettings();
		return { success: true, settings: allSettings };
	},

	postSettings: async ({ body: { key, value } }) => {
		setSetting(key, value);

		if (key.startsWith("telegram")) await resetTelegramClient();

		return { success: true, message: "Setting updated" };
	},

	postSettingsBatch: async ({ body }) => {
		for (const [key, value] of Object.entries(body)) {
			if (value === undefined) continue;
			if ((key === "password" || key === "username") && value === "") continue;
			setSetting(key, value);
		}

		if (
			body.telegramApiId !== undefined ||
			body.telegramApiHash !== undefined ||
			body.telegramSession !== undefined
		) {
			await resetTelegramClient();
		}

		return { success: true, message: "Settings updated" };
	},
};
