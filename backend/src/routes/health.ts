import { Elysia } from "elysia";

export const healthRoutes = new Elysia({ prefix: "/health" })
	.get("/", () => ({
		status: "ok",
		timestamp: new Date().toISOString(),
		database: "connected",
	}))
	.get("/ready", () => ({
		ready: true,
	}));
