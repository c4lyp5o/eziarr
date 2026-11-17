import { t } from "elysia";

export const TelegramModel = {
	// bodies
	postTelegramSendCode: t.Object({ phoneNumber: t.String() }),
	postTelegramLogin: t.Object({
		code: t.String(),
		password: t.Optional(t.String()),
	}),
	postTelegramSearch: t.Object({
		// Left out, every channel the account has is searched.
		channel: t.Optional(t.String()),
		query: t.String({ minLength: 1, maxLength: 200 }),
		// The title being searched for, so its alternate names and year can
		// be used too. Optional: a search works from the query alone.
		service: t.Optional(
			t.Union([t.Literal("radarr"), t.Literal("sonarr"), t.Literal("lidarr")]),
		),
		serviceId: t.Optional(t.Union([t.String(), t.Number()])),
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
				channelTitle: t.String(),
				filename: t.String(),
				size: t.Number(),
				date: t.Number(),
				messageText: t.String(),
				// How well the file fits the title, about 0 to 1.2 (match.js).
				score: t.Number(),
			}),
		),
	}),
	postTelegramImportResponse: t.Object({
		success: t.Boolean(),
		message: t.String(),
	}),
};
