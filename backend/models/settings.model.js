import { t } from "elysia";

export const SettingsModel = {
	// bodies
	postSettings: t.Object({
		key: t.String(),
		value: t.Any(),
	}),
	postSettingsBatch: t.Object({
		username: t.Optional(t.String()),
		password: t.Optional(t.String()),
		syncEnabled: t.Boolean(),
		hunterEnabled: t.Boolean(),
		syncInterval: t.Number(),
		hunterInterval: t.Number(),
		radarrUrl: t.Optional(t.String()),
		radarrApiKey: t.Optional(t.String()),
		sonarrUrl: t.Optional(t.String()),
		sonarrApiKey: t.Optional(t.String()),
		lidarrUrl: t.Optional(t.String()),
		lidarrApiKey: t.Optional(t.String()),
		prowlarrUrl: t.Optional(t.String()),
		prowlarrApiKey: t.Optional(t.String()),
		telegramApiId: t.Optional(t.String()),
		telegramApiHash: t.Optional(t.String()),
		pathMapRemote: t.Optional(t.String()),
		telegramSession: t.Optional(t.String()),
	}),

	// responses
	getSettingsResponse: t.Object({
		success: t.Boolean(),
		settings: t.Record(t.String(), t.Any()),
	}),
	postSettingsResponse: t.Object({
		success: t.Boolean(),
		message: t.String(),
	}),
	postSettingsBatchResponse: t.Object({
		success: t.Boolean(),
		message: t.String(),
	}),
};
