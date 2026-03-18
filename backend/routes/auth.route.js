import { Elysia } from "elysia";
import { AuthModel } from "../models/auth.model";
import { AuthService } from "../services/auth.service";

export const AuthRoutes = new Elysia({ prefix: "/api/v1" })
	.get("/firsttime", AuthService.getFirstTime, {
		response: AuthModel.getFirstTimeResponse,
		detail: {
			summary: "First time run deteminer",
			description: "Determine if Eziarr is running for the first time.",
			tags: ["Auth"],
		},
	})
	.post("/firsttime", AuthService.postFirstTime, {
		body: AuthModel.postFirstTime,
		response: AuthModel.postFirstTimeResponse,
		detail: {
			summary: "First time setup",
			description:
				"Sets up Eziarr for the first time with provided credentials and flips the first time run value.",
			tags: ["Auth"],
		},
	})
	.post("/login", AuthService.login, {
		body: AuthModel.login,
		response: AuthModel.loginResponse,
		detail: {
			summary: "User Login",
			description: "Logs in user using provided credentials.",
			tags: ["Auth"],
		},
	})
	.get("/me", AuthService.me, {
		response: AuthModel.meResponse,
		detail: {
			summary: "Returns current logged in user",
			description: "Decodes current JWT in cookie and sends it back",
			tags: ["Auth"],
		},
	})
	.post("/refresh", AuthService.refresh, {
		response: AuthModel.refreshResponse,
		detail: {
			summary: "Refreshes token",
			description: "Token refresher",
			tags: ["Auth"],
		},
	})
	.post("/logout", AuthService.logout, {
		response: AuthModel.logoutResponse,
		detail: {
			summary: "Logs out current user",
			description: "Logs out current user and removes all auth related cookies",
			tags: ["Auth"],
		},
	});
