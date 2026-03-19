import crypto from "node:crypto";
import { Elysia } from "elysia";
import { cookie } from "@elysiajs/cookie";
import { jwt } from "@elysiajs/jwt";
import { staticPlugin } from "@elysiajs/static";
import { openapi } from "@elysiajs/openapi";
import { generalLogger as logger } from "./logger";
import { CLIENT_DIR } from "./config";

import { HealthRoute } from "./routes/health.route";
import { AuthRoutes } from "./routes/auth.route";
import { MissingRoutes } from "./routes/missing.route";
import { SettingsRoutes } from "./routes/settings.route";
import { SystemRoutes } from "./routes/system.route";
import { DownloadsRoutes } from "./routes/downloads.route";
import { TelegramRoutes } from "./routes/telegram.route";
import { IARoutes } from "./routes/ia.route";
import { OpendirRoutes } from "./routes/opendir.route";
import { HTTPImportRoutes } from "./routes/httpimport.route";

import { AuthPlugin } from "./plugins/auth.plugin";
import { ProtectorPlugin } from "./plugins/protector.plugin";

const JWT_SECRET =
	process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex");

export const app = new Elysia()
	.onError(({ code, error, set }) => {
		if (code === "VALIDATION") {
			process.env.NODE_ENV === "dev" && logger.error(error);
			set.status = 400;
			return { success: false, message: "Bad request" };
		}
		if (code === "NOT_FOUND") {
			set.status = 404;
			return { success: false, message: "Not Found" };
		}

		set.status = 500;
		logger.error(`[SERVER] 💥[${code}] Server Error: `, error);
		const message =
			process.env.NODE_ENV === "dev" ? error.message : "Internal Server Error";
		return { success: false, message };
	})

	.use(cookie())

	.use(
		jwt({
			name: "jwt",
			secret: JWT_SECRET,
		}),
	)

	.use(HealthRoute)
	.derive(async ({ jwt, cookie: c }) => {
		console.log("[AuthPlugin] cookie", c);
		const token = c.eziarr_access?.value;
		if (!token) return { user: null };

		try {
			const payload = await jwt.verify(token);
			if (!payload?.username) return { user: null };
			return { user: { username: payload.username } };
		} catch {
			return { user: null };
		}
	})
	.use(AuthRoutes)
	.guard((api) =>
		api
			.onBeforeHandle(({ user, set }) => {
				console.log("[ProtectorPlugin] user", user);
				if (!user) {
					set.status = 401;
					return { success: false, message: "Unauthorized" };
				}
			})
			.use(MissingRoutes)
			.use(SettingsRoutes)
			.use(SystemRoutes)
			.use(DownloadsRoutes)
			.use(TelegramRoutes)
			.use(IARoutes)
			.use(OpendirRoutes)
			.use(HTTPImportRoutes),
	)
	.use(
		staticPlugin({
			assets: CLIENT_DIR,
			prefix: "/",
			fallback: "index.html",
			alwaysStatic: true,
			headers: { "Cache-Control": "max-age=31536000" },
		}),
	);

if (process.env.NODE_ENV === "dev") {
	app.use(
		openapi({
			exclude: {
				paths: ["/", "/*", ""],
			},
			documentation: {
				info: {
					title: "Eziarr API 🍿",
					version: "1.0.0",
					description:
						"The ultimate backend for managing missing *Arr media, scraping Telegram, and deep-searching the high seas.",
					contact: {
						name: "c4lyp5o",
						url: "https://github.com/c4lyp5o/eziarr",
						email: "calypso[at]calypsocloud.one",
					},
					license: {
						name: "MIT",
						url: "https://opensource.org/licenses/MIT",
					},
				},
				servers: [
					{
						url: "http://localhost:5000",
						description: "Local Development Server",
					},
				],
				tags: [
					{ name: "Auth", description: "Authentication and authorization" },
					{ name: "General", description: "System health and sync" },
					{
						name: "*Arr Integration",
						description: "Commands for Radarr, Sonarr, Lidarr",
					},
					{
						name: "Telegram",
						description: "MTProto auth and channel scraping",
					},
					{
						name: "Alternative Sources",
						description: "Internet Archive & Open Directories",
					},
					{
						name: "Settings",
						description: "Database and worker configuration",
					},
				],
				// components: {
				// 	securitySchemes: {
				// 		ApiKeyAuth: {
				// 			type: "apiKey",
				// 			in: "header",
				// 			name: "X-Api-Key",
				// 		},
				// 	},
				// },
			},
		}),
	);
}

try {
	app.listen(process.env.PORT || 5000);
	process.env.NODE_ENV === "dev" &&
		logger.info("[SERVER] 📘 Eziarr OpenAPI UI enabled at /openapi");
	logger.info(
		`[SERVER] Eziarr is running at ${app.server?.hostname}:${app.server?.port}`,
	);
} catch (err) {
	logger.error("[SERVER] Failed to start server: ", err);
	process.exit(1);
}
