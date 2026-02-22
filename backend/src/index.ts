import dotenv from "dotenv";

dotenv.config({ path: "../.env" });

import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { Elysia } from "elysia";
import { FRONTEND_URLs } from "./constants";
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
			origin: [
				...(process.env.BASE_URL ? [process.env.BASE_URL] : []),
				...(process.env.BACKEND_URL ? process.env.BACKEND_URL.split(",") : []),
				"http://localhost:3001",
				...FRONTEND_URLs,
			],
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

console.log(`Listening on ${app.server?.url}`);

export type App = typeof app;
export * as databaseTypes from "./database/type";
export * as requestTypes from "./types";

