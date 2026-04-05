import { t } from "elysia";

export const SystemModel = {
	// query
	getSystemLogs: t.Object({
		type: t.Optional(t.String()),
	}),

	// bodies
	postSystemTest: t.Object({
		service: t.String(),
		url: t.String(),
		apiKey: t.String(),
	}),

	// responses
	getSystemStatusResponse: t.Object({
		success: t.Boolean(),
		isSetup: t.Boolean(),
		currentVersion: t.String(),
		latestVersion: t.Optional(t.String()),
		updateAvailable: t.Boolean(),
		features: t.Object({
			radarr: t.Boolean(),
			sonarr: t.Boolean(),
			lidarr: t.Boolean(),
			prowlarr: t.Boolean(),
			telegram: t.Boolean(),
		}),
	}),
	postSystemTestResponse: t.Object({
		success: t.Boolean(),
		message: t.String(),
	}),
	getSystemTasksResponse: t.Object({
		success: t.Boolean(),
		tasks: t.Array(
			t.Object({
				id: t.String(),
				type: t.String(),
				status: t.String(),
				message: t.String(),
				progress: t.Number(),
				updated_at: t.Number(),
			}),
		),
	}),
	getSystemLogsResponse: t.Object({
		success: t.Boolean(),
		logs: t.Array(t.String()),
		message: t.Optional(t.String()),
	}),
};
