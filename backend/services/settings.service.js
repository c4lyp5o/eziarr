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
			console.log(key, value);
			if (value === undefined) continue;
			if (key === "password" && value === "") continue;
			if (key === "password" && value !== "") {
				const hashedPassword = await Bun.password.hash(value);
				setSetting(key, hashedPassword);
			}
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
