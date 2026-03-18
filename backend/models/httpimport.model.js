import { t } from "elysia";

export const HTTPImportModel = {
	// bodies
	postHTTPImport: t.Object({
		service: t.Union([
			t.Literal("radarr"),
			t.Literal("sonarr"),
			t.Literal("lidarr"),
		]),
		serviceId: t.Union([t.String(), t.Number()]),
		url: t.String(),
		filename: t.String(),
	}),

	// responses
	postHTTPImportResponse: t.Object({
		success: t.Boolean(),
		message: t.String(),
	}),
};
