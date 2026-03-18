import { t } from "elysia";

export const DownloadsModel = {
	// query
	getDownloadsHistory: t.Object({
		limit: t.Optional(t.String()),
		status: t.Optional(t.String()),
	}),

	// responses
	getDownloadsQueueResponse: t.Object({
		success: t.Boolean(),
		queue: t.Array(t.Any()),
	}),
	getDownloadsHistoryResponse: t.Object({
		success: t.Boolean(),
		history: t.Array(t.Any()),
	}),
	getDownloadsStatsResponse: t.Object({
		success: t.Boolean(),
		stats: t.Array(
			t.Object({
				service: t.Union([
					t.Literal("radarr"),
					t.Literal("sonarr"),
					t.Literal("lidarr"),
				]),
				total: t.Number(),
				completed: t.Number(),
				failed: t.Number(),
				bytes: t.Number(),
				avg_duration_ms: t.Any(),
			}),
		),
	}),
};
