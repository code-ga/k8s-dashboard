import dotenv from "dotenv";
dotenv.config({ path: "../.env" });

import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { Elysia } from "elysia";
import { OpenAPI } from "./libs/auths/openAPI";
import { apiRouter } from "./routes";

export const app = new Elysia()
	.use(
		cors({
			methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
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
	.listen(3001);

console.log(`Listening on ${app.server?.url}`);

export type App = typeof app;

