import { Elysia } from "elysia";
import { IAModel } from "../models/ia.model";
import { IAService } from "../services/ia.service";

export const IARoutes = new Elysia({ prefix: "/api/v1/ia" })
	.post("/search", IAService.postIASearch, {
		body: IAModel.postIASearch,
		response: IAModel.postIASearchResponse,
		detail: {
			summary: "Search Internet Archive",
			description:
				"Search for items on the Internet Archive by a query string. Returns a list of matching items with basic metadata and a URL to view details on the IA website.",
			tags: ["Alternative Sources"],
		},
	})
	.get("/files/:identifier", IAService.getIAFiles, {
		params: IAModel.getIAFiles,
		detail: {
			summary: "Get Files from Internet Archive",
			description:
				"Retrieve a list of files associated with a specific item on the Internet Archive, identified by its unique identifier. This is typically used after searching for an item to see what media files are available for download.",
			tags: ["Alternative Sources"],
		},
	});
