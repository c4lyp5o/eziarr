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
			if (key === "password") {
				const hashedPassword = await Bun.password.hash(value);
				setSetting(key, hashedPassword);
			}
			if (key.startsWith("telegram")) await resetTelegramClient();
			setSetting(key, value);
		}

		return { success: true, message: "Settings updated" };
	},
};
