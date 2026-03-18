import { Elysia } from "elysia";
import { MissingModel } from "../models/missing.model";
import { MissingService } from "../services/missing.service";

export const MissingRoutes = new Elysia({ prefix: "/api/v1/missing" })
	.get("/", MissingService.getMissing, {
		response: MissingModel.getMissingResponse,
		detail: {
			summary: "Trigger Search for an Item",
			description:
				"Manually trigger a search in Radarr/Sonarr/Lidarr for a specific movie/episode/album by its service ID. This is useful for testing or forcing a re-search outside of the regular intervals.",
			tags: ["*Arr Integration"],
		},
	})
	.post("/search", MissingService.postMissingSearch, {
		body: MissingModel.postMissingSearch,
		response: MissingModel.postMissingSearchResponse,
		detail: {
			summary: "Perform Deep Search via Prowlarr",
			description:
				"Use Prowlarr to perform a deep search across all indexers for a specific movie, episode or album. This can help find releases that Radarr/Sonarr might have missed. The results include metadata and download links for potential matches.",
			tags: ["*Arr Integration"],
		},
	})
	.post("/deepsearch", MissingService.postMissingDeepSearch, {
		body: MissingModel.postMissingDeepSearch,
		response: MissingModel.postMissingDeepsearchResponse,
		detail: {
			summary: "Perform Deep Search via Prowlarr",
			description:
				"Use Prowlarr to perform a deep search across all indexers for a specific movie, episode or album. This can help find releases that Radarr/Sonarr might have missed. The results include metadata and download links for potential matches.",
			tags: ["*Arr Integration"],
		},
	})
	.post("/forcegrab", MissingService.postMissingForceGrab, {
		body: MissingModel.postMissingForceGrab,
		response: MissingModel.postMissingForcegrabResponse,
		detail: {
			summary: "Force Grab an Item with Fixes",
			description:
				"Attempt to grab a movie/episode via Prowlarr. If rejected due to profile, language, or queue, Eziarr will temporarily drop the item's restrictions, push the download, and instantly restore the item to its original state.",
			tags: ["*Arr Integration"],
		},
	})
	.post("/unmonitor", MissingService.postMissingUnmonitor, {
		body: MissingModel.postMissingUnmonitor,
		response: MissingModel.postMissingUnmonitorResponse,
		detail: {
			summary: "Unmonitor an Item",
			description:
				"Stop monitoring a movie/episode/album in Radarr/Sonarr/Lidarr by setting monitored=false. This will remove it from the missing list and prevent future monitoring.",
			tags: ["*Arr Integration"],
		},
	});
