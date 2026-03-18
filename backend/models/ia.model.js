import { t } from "elysia";

export const IAModel = {
	// params
	getIAFiles: t.Object({
		identifier: t.String(),
	}),

	// bodies
	postIASearch: t.Object({
		query: t.String(),
	}),

	// responses
	postIASearchResponse: t.Object({
		success: t.Boolean(),
		files: t.Array(
			t.Object({
				id: t.String(),
				title: t.String(),
				year: t.Optional(t.Any()), // Sometimes year is missing
				downloads: t.Number(),
				detailsUrl: t.String(),
			}),
		),
	}),
	getIAFilesResponse: t.Object({
		success: t.Boolean(),
		filesInside: t.Array(
			t.Object({
				downloadUrl: t.String(),
				filename: t.String(),
				size: t.String(),
				format: t.String(),
			}),
		),
	}),
};
