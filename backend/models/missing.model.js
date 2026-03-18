import { t } from "elysia";

export const MissingModel = {
	// bodies
	postMissingSearch: t.Object({
		service: t.Union([
			t.Literal("radarr"),
			t.Literal("sonarr"),
			t.Literal("lidarr"),
		]),
		id: t.Union([t.String(), t.Number()]),
	}),
	postMissingDeepSearch: t.Object({
		type: t.Union([
			t.Literal("movie"),
			t.Literal("episode"),
			t.Literal("album"),
		]),
		query: t.String(),
	}),
	postMissingForceGrab: t.Object({
		service: t.Union([
			t.Literal("radarr"),
			t.Literal("sonarr"),
			t.Literal("lidarr"),
		]),
		serviceId: t.Union([t.String(), t.Number()]),
		title: t.String(),
		downloadUrl: t.String(),
	}),
	postMissingUnmonitor: t.Object({
		service: t.Union([
			t.Literal("radarr"),
			t.Literal("sonarr"),
			t.Literal("lidarr"),
		]),
		serviceId: t.Union([t.String(), t.Number()]),
	}),

	// responses
	getMissingResponse: t.Object({
		success: t.Boolean(),
		missing: t.Array(
			t.Object({
				id: t.String(),
				serviceId: t.Integer(),
				title: t.String(),
				seriesTitle: t.Optional(t.Any()),
				type: t.Union([
					t.Literal("movie"),
					t.Literal("episode"),
					t.Literal("album"),
				]),
				service: t.Union([
					t.Literal("radarr"),
					t.Literal("sonarr"),
					t.Literal("lidarr"),
					t.Literal("eziarr"),
				]),
				releaseDate: t.Optional(t.Any()),
				posterUrl: t.Optional(t.Any()),
				status: t.String(),
			}),
		),
		queue: t.Array(
			t.Object({
				service: t.Union([
					t.Literal("radarr"),
					t.Literal("sonarr"),
					t.Literal("lidarr"),
					t.Literal("eziarr"),
				]),
				serviceId: t.Integer(),
				status: t.String(),
				trackStatus: t.String(),
				title: t.String(),
				quality: t.Optional(t.String()),
				indexer: t.Optional(t.String()),
				timeleft: t.Optional(t.String()),
			}),
		),
	}),
	postMissingSearchResponse: t.Object({
		success: t.Boolean(),
		message: t.String(),
	}),
	postMissingDeepsearchResponse: { success: t.Boolean(), torrents: t.Array() },
	postMissingForcegrabResponse: t.Object({
		success: t.Boolean(),
		message: t.String(),
	}),
	postMissingUnmonitorResponse: t.Object({
		success: t.Boolean(),
		message: t.String(),
	}),
};
