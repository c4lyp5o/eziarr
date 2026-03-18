import { t } from "elysia";

export const OpendirModel = {
	// bodies
	postOpendirScan: t.Object({
		url: t.String(),
	}),

	// responses
	postOpendirScanResponse: t.Object({
		success: t.Boolean(),
		files: t.Array(
			t.Object({
				downloadUrl: t.String(),
				filename: t.String(),
				ext: t.String(),
			}),
		),
	}),
};
