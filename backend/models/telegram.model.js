import { t } from "elysia";

export const TelegramModel = {
	// bodies
	postTelegramSendCode: t.Object({ phoneNumber: t.String() }),
	postTelegramLogin: t.Object({
		code: t.String(),
		password: t.Optional(t.String()),
	}),
	postTelegramSearch: t.Object({
		channel: t.String(),
		query: t.String(),
	}),
	postTelegramImport: t.Object({
		service: t.Union([
			t.Literal("radarr"),
			t.Literal("sonarr"),
			t.Literal("lidarr"),
		]),
		serviceId: t.Union([t.String(), t.Number()]),
		channel: t.String(),
		messageId: t.Number(),
		filename: t.String(),
	}),

	// responses
	getTelegramStatusResponse: t.Object({
		success: t.Boolean(),
		connected: t.Boolean(),
		channels: t.Array(
			t.Object({
				id: t.String(),
				title: t.String(),
				username: t.Optional(t.Any()),
			}),
		),
	}),
	postTelegramSendCodeResponse: t.Object({
		success: t.Boolean(),
		message: t.String(),
	}),
	postTelegramLoginResponse: t.Object({
		success: t.Boolean(),
		message: t.String(),
	}),
	postTelegramSearchResponse: t.Object({
		success: t.Boolean(),
		files: t.Array(
			t.Object({
				id: t.Number(),
				channel: t.String(),
				filename: t.String(),
				size: t.Number(),
				date: t.Number(),
				messageText: t.String(),
			}),
		),
	}),
	postTelegramImportResponse: t.Object({
		success: t.Boolean(),
		message: t.String(),
	}),
};
