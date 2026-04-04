import { t } from "elysia";

export const SettingsModel = {
	// bodies
	postSettings: t.Object({
		key: t.String(),
		value: t.Any(),
	}),
	postSettingsBatch: t.Object({
		password: t.Optional(t.String({ minLength: 8 })),
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
	}),

	// responses
	getPublicSettingsResponse: t.Object({
		success: t.Boolean(),
		settings: t.Object({
			syncEnabled: t.Boolean(),
			hunterEnabled: t.Boolean(),
			syncInterval: t.Number(),
			hunterInterval: t.Number(),
			radarrConfigured: t.Boolean(),
			sonarrConfigured: t.Boolean(),
			lidarrConfigured: t.Boolean(),
			prowlarrConfigured: t.Boolean(),
			telegramConfigured: t.Boolean(),
			radarrUrl: t.Optional(t.String()),
			sonarrUrl: t.Optional(t.String()),
			lidarrUrl: t.Optional(t.String()),
			prowlarrUrl: t.Optional(t.String()),
			pathMapRemote: t.Optional(t.String()),
		}),
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
