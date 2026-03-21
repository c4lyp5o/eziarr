import { Elysia } from "elysia";
import { SettingsModel } from "../models/settings.model";
import { SettingsService } from "../services/settings.service";

export const SettingsRoutes = new Elysia({ prefix: "/api/v1/settings" })
	.get("/", SettingsService.getPublicSettings, {
		response: SettingsModel.getPublicSettingsResponse,
		detail: {
			summary: "Get Public Settings",
			description:
				"Retrieve public current settings and their values for the application.",
			tags: ["Settings"],
		},
	})
	.post("/", SettingsService.postSettings, {
		body: SettingsModel.postSettings,
		response: SettingsModel.postSettingsResponse,
		detail: {
			summary: "Update a Setting",
			description:
				"Update a single setting by key. The value should be a string, and it's up to the client to ensure correct formatting (e.g. numbers, booleans). Returns the saved key-value pair.",
			tags: ["Settings"],
		},
	})
	.post("/batch", SettingsService.postSettingsBatch, {
		body: SettingsModel.postSettingsBatch,
		response: SettingsModel.postSettingsBatchResponse,
		detail: {
			summary: "Batch Update Settings",
			description:
				"Update multiple settings at once by providing an object of key-value pairs. This is more efficient for saving multiple settings in one request. Returns success status.",
			tags: ["Settings"],
		},
	});
