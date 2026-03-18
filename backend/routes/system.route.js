import { Elysia } from "elysia";
import { SystemModel } from "../models/system.model";
import { SystemService } from "../services/system.service";

export const SystemRoutes = new Elysia({ prefix: "/api/v1/system" })
	.get("/status", SystemService.getSystem, {
		response: SystemModel.getSystemResponse,
		detail: {
			summary: "Get System Status",
			description: "Retrieve status of services for the application.",
			tags: ["Settings"],
		},
	})
	.post("/test", SystemService.postSystemTest, {
		body: SystemModel.postSystemTest,
		response: SystemModel.postSystemTestResponse,
		detail: {
			summary: "Test Service Connection",
			description:
				"Tests unsaved credentials against an *Arr service's status endpoint.",
			tags: ["Settings"],
		},
	})
	.get("/tasks", SystemService.getSystemTasks, {
		response: SystemModel.getSystemTasksResponse,
		detail: {
			summary: "Get Active Tasks",
			description:
				"Returns a list of currently running background tasks across the server and worker.",
			tags: ["General"],
		},
	})
	.get("/logs", SystemService.getSystemLogs, {
		query: SystemModel.getSystemLogs,
		response: SystemModel.getSystemLogsResponse,
		detail: {
			summary: "Get System Logs",
			description: "Returns the tail of the Eziarr system logs.",
			tags: ["General"],
		},
	});
