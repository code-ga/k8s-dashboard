import Elysia from "elysia";
import { betterAuthRouter } from "./auth";
import { healthRoutes } from "./health";
import { clusterRoute } from "./cluster";
import { agentRoute } from "./agent";
import { agentManagerService } from "../services/agentManager";
import { profileRouter } from "./profile";
import { nodesRoute } from "./nodes";
import { podRoute } from "./pod";

const apiRouter = new Elysia({ prefix: "/api" })
	.use(agentManagerService)
	.use(betterAuthRouter)
	.use(healthRoutes)
	.use(clusterRoute)
	.use(agentRoute)
	.use(nodesRoute)
	.use(profileRouter)
	.use(podRoute);

export { apiRouter };
