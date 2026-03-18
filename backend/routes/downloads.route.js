import { Elysia } from "elysia";
import { DownloadsModel } from "../models/downloads.model";
import { DownloadsService } from "../services/downloads.service";

export const DownloadsRoutes = new Elysia({ prefix: "/api/v1/downloads" })
	.get("/queue", DownloadsService.getDownloadsQueue, {
		response: DownloadsModel.getDownloadsQueueResponse,
		detail: {
			summary: "Get Unified Download Queue",
			description:
				"Returns Eziarr pending/retry/downloading jobs mixed with active *Arr client downloads.",
			tags: ["Settings", "General"],
		},
	})
	.get("/history", DownloadsService.getDownloadsHistory, {
		query: DownloadsModel.getDownloadsHistory,
		response: DownloadsModel.getDownloadsHistoryResponse,
		detail: {
			summary: "Get Download History",
			description: "Returns completed/failed jobs for audit and UI display.",
			tags: ["Settings", "General"],
		},
	})
	.get("/stats", DownloadsService.getDownloadsStats, {
		response: DownloadsModel.getDownloadsStatsResponse,
		detail: {
			summary: "Get Download Stats",
			description: "Returns download statistics for audit and UI display.",
			tags: ["Settings", "General"],
		},
	});
