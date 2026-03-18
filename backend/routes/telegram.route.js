import { Elysia } from "elysia";
import { TelegramModel } from "../models/telegram.model";
import { TelegramService } from "../services/telegram.service";

export const TelegramRoutes = new Elysia({ prefix: "/api/v1/telegram" })
	.get("/status", TelegramService.getTelegramStatus, {
		response: TelegramModel.getTelegramStatusResponse,
		detail: {
			summary: "Check Telegram Connection Status",
			description:
				"Check if the Telegram client is connected and authorized, and retrieve a list of channels the client has access to. This can be used to verify Telegram integration and select channels for searching or importing.",
			tags: ["Telegram"],
		},
	})
	.post("/auth/send-code", TelegramService.postTelegramSendCode, {
		body: TelegramModel.postTelegramSendCode,
		response: TelegramModel.postTelegramSendCodeResponse,
		detail: {
			summary: "Send Telegram Login Code",
			description:
				"Initiate the Telegram login process by sending a login code to the specified phone number. This is the first step in authenticating the Telegram client.",
			tags: ["Telegram"],
		},
	})
	.post("/auth/login", TelegramService.postTelegramLogin, {
		body: TelegramModel.postTelegramLogin,
		response: TelegramModel.postTelegramLoginResponse,
		detail: {
			summary: "Complete Telegram Login",
			description:
				"Complete the Telegram login process by providing the code received on the phone and, if required, the two-factor authentication password. This will authenticate the Telegram client for future API interactions.",
			tags: ["Telegram"],
		},
	})
	.post("/search", TelegramService.postTelegramSearch, {
		body: TelegramModel.postTelegramSearch,
		response: TelegramModel.postTelegramSearchResponse,
		detail: {
			summary: "Search for Media in a Telegram Channel",
			description:
				"Search a specific Telegram channel for messages containing media (documents) that match the query. Returns an array of matching messages with metadata about the media files, which can then be imported.",
			tags: ["Telegram"],
		},
	})
	.post("/import", TelegramService.postTelegramImport, {
		body: TelegramModel.postTelegramImport,
		response: TelegramModel.postTelegramImportResponse,
		detail: {
			summary: "Import Media from Telegram to Radarr/Sonarr/Lidarr",
			description:
				"Download a media file from a Telegram message and send it to Radarr/Sonarr for import. The Telegram message is identified by its channel and message ID. Note: Sonarr relies on filename parsing, so ensure the file is named with SxxExx format for episodes.",
			tags: ["Telegram", "*Arr Integration"],
		},
	});
