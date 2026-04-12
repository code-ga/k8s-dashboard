import { logger } from "./utils/logger";
import dotenv from "dotenv";

dotenv.config({ path: "../.env" });

import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { Elysia, type AnyElysia } from "elysia";
import { OpenAPI } from "./libs/auths/openAPI";
import { apiRouter } from "./routes";
import { scalingController } from "./services/scaling.controller";
import { generateSeedRoles } from "./utils/role";
import { auth } from "./libs/auths/auth.config";

scalingController.start();
await generateSeedRoles();

import { getPermissionsGrouped } from "./constants/permissions";

const port = process.env.PORT || 3001;

export const app = new Elysia()
	.use(
		cors({
			// methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
			credentials: true,
		}),
	)
	.mount("/auth",auth.handler)	
	.get("/", () => ({ hello: "Bun👋" }))
	.use(
		openapi({
			documentation: {
				components: await OpenAPI.components,
				paths: await OpenAPI.getPaths(),
			},
		}),
	)
	.use(apiRouter);

app.get("/permissions", async (_) => {
	return {
		success: true,
		message: "Permissions fetched successfully",
		data: getPermissionsGrouped(),
		timestamp: Date.now(),
	};
});

app.get("/route-permissions", async (_ctx) => {
	const permissions = (app as AnyElysia).routes.map((route) => {
		// Extract roleAuth from hooks
		return {
			method: route.method,
			path: route.path,
			permission: (route.hooks.detail as { "x-permission"?: string } | undefined)
				?.["x-permission"],
		};
	});
	return {
		success: true,
		message: "Route permissions fetched successfully",
		data: permissions,
		timestamp: Date.now(),
	};
});

app.listen(port);

logger.info(`Listening on ${app.server?.url}`);

process.on("uncaughtException", (error) => {
	logger.fatal("Uncaught Exception", {
		error: error.message,
		stack: error.stack,
	});
	process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
	logger.error("Unhandled Rejection at:", { promise, reason });
});

export type App = typeof app;
export * as databaseTypes from "./database/type";
export * as requestTypes from "./types";
export {
	type Permission,
	type PermissionFilter,
	PermissionGroupSchema,
} from "./constants/permissions";
