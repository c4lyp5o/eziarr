import { Elysia } from "elysia";
import { OpendirModel } from "../models/opendir.model";
import { OpendirService } from "../services/opendir.service";

export const OpendirRoutes = new Elysia({ prefix: "/api/v1/opendir" }).post(
	"/scan",
	OpendirService.postOpendirScan,
	{
		body: OpendirModel.postOpendirScan,
		response: OpendirModel.postOpendirScanResponse,
		detail: {
			summary: "Scan an Open Directory",
			description: `Given the URL of an open directory (a web page that lists files, often on a public server), scan the page and return a list of media files available for download. This can be used to find direct download links for movies or episodes that can then be sent to Radarr/Sonarr.`,
			tags: ["Alternative Sources"],
		},
	},
);
