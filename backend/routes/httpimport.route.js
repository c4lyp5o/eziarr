import { Elysia } from "elysia";
import { HTTPImportModel } from "../models/httpimport.model.js";
import { HTTPImportService } from "../services/httpimport.service.js";

export const HTTPImportRoutes = new Elysia({ prefix: "/api/v1/http" }).post(
	"/import",
	HTTPImportService.postHTTPImport,
	{
		body: HTTPImportModel.postHTTPImport,
		response: HTTPImportModel.postHTTPImportResponse,
		detail: {
			summary: "Import Media from HTTP URL to Radarr/Sonarr/Lidarr",
			description:
				"Download a media file from an HTTP URL and send it to Radarr/Sonarr/Lidarr for import. This is useful for importing files from open directories or direct links. Note: Sonarr relies on filename parsing, so ensure the file is named with SxxExx format for episodes.",
			tags: ["Alternative Sources", "*Arr Integration"],
		},
	},
);
