import { logger } from "./utils/logger";
import dotenv from "dotenv";

dotenv.config({ path: "../.env" });

import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { Elysia } from "elysia";
import { OpenAPI } from "./libs/auths/openAPI";
import { apiRouter } from "./routes";
import { scalingController } from "./services/scaling.controller";

scalingController.start();

const port = process.env.PORT || 3001;

export const app = new Elysia()
	.use(
		cors({
			// methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
			credentials: true,
		}),
	)
	.get("/", () => ({ hello: "Bun👋" }))
	.use(
		openapi({
			documentation: {
				components: await OpenAPI.components,
				paths: await OpenAPI.getPaths(),
			},
		}),
	)

	.use(apiRouter)
	.listen(port);

logger.info(`Listening on ${app.server?.url}`);

process.on("uncaughtException", (error) => {
	logger.fatal("Uncaught Exception", { error: error.message, stack: error.stack });
	process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
	logger.error("Unhandled Rejection at:", { promise, reason });
});

export type App = typeof app;
export * as databaseTypes from "./database/type";
export * as requestTypes from "./types";
