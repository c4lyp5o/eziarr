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
		// Optional override: bypass the original-language guard and force the
		// grab through even when the release's language doesn't match the
		// title's original language (e.g. an English title with a German rip).
		// Default false — a mismatched grab stays rejected unless asked for.
		forceLanguage: t.Optional(t.Boolean()),
		// From the deep-search result; torrent when absent.
		protocol: t.Optional(t.Union([t.Literal("torrent"), t.Literal("usenet")])),
	}),
	postMissingUnmonitor: t.Object({
		service: t.Union([
			t.Literal("radarr"),
			t.Literal("sonarr"),
			t.Literal("lidarr"),
		]),
		serviceId: t.Union([t.String(), t.Number()]),
	}),

	postMissingBulk: t.Object({
		action: t.Union([t.Literal("search"), t.Literal("unmonitor")]),
		items: t.Array(
			t.Object({
				service: t.Union([
					t.Literal("radarr"),
					t.Literal("sonarr"),
					t.Literal("lidarr"),
				]),
				serviceId: t.Union([t.String(), t.Number()]),
			}),
			{ minItems: 1, maxItems: 1000 },
		),
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
				// 0-100, or null before the client reports a size.
				progress: t.Optional(t.Nullable(t.Number())),
			}),
		),
		// *Arr services whose queue didn't answer this time.
		unavailable: t.Optional(t.Array(t.String())),
	}),
	postMissingSearchResponse: t.Object({
		success: t.Boolean(),
		message: t.String(),
	}),
	postMissingDeepsearchResponse: t.Object({
		success: t.Boolean(),
		torrents: t.Array(
			t.Object({
				title: t.String(),
				size: t.Number(),
				indexer: t.Optional(t.Nullable(t.String())),
				seeders: t.Nullable(t.Number()),
				leechers: t.Nullable(t.Number()),
				grabs: t.Nullable(t.Number()),
				age: t.Optional(t.Nullable(t.Number())),
				publishDate: t.Nullable(t.String()),
				protocol: t.String(),
				freeleech: t.Boolean(),
				infoUrl: t.Nullable(t.String()),
				downloadUrl: t.Optional(t.Nullable(t.String())),
				guid: t.String(),
			}),
		),
	}),
	postMissingForcegrabResponse: t.Object({
		success: t.Boolean(),
		message: t.String(),
	}),
	postMissingBulkResponse: t.Object({
		success: t.Boolean(),
		message: t.String(),
		done: t.Integer(),
		failed: t.Array(t.String()),
	}),
	postMissingUnmonitorResponse: t.Object({
		success: t.Boolean(),
		message: t.String(),
	}),
};
