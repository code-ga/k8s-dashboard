import Elysia from "elysia";
import { betterAuthRouter } from "./auth";
import { healthRoutes } from "./health";
import { clusterRoute } from "./cluster";
import { agentRoute } from "./agent";
import { agentManagerService } from "../services/agentManager";
import { userRouter } from "./user";

const apiRouter = new Elysia({ prefix: "/api" })
	.use(agentManagerService)
	.use(betterAuthRouter)
	.use(healthRoutes)
	.use(clusterRoute)
	.use(agentRoute)
	.use(userRouter);

export { apiRouter };
