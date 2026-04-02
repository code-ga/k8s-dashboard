import Elysia from "elysia";
import { agentManagerService } from "../services/agentManager";
import { agentRoute } from "./agent";
import { betterAuthRouter } from "./auth";
import { clusterRoute } from "./cluster";
import { configmapRoute } from "./configmap";
import { deploymentRoute } from "./deployment";
import { healthRoutes } from "./health";
import { ingressRoute } from "./ingress";
import { nodesRoute } from "./nodes";
import { podRoute } from "./pod";
import { profileRouter } from "./profile";
import { secretRoute } from "./secret";
import { pvcRoute } from "./pvc";
import { roleRoute } from "./role";
import { serviceRoute } from "./service";

const apiRouter = new Elysia({ prefix: "/api" })
	.use(agentManagerService)
	.use(betterAuthRouter)
	.use(healthRoutes)
	.use(clusterRoute)
	.use(agentRoute)
	.use(nodesRoute)
	.use(profileRouter)
	.use(podRoute)
	.use(deploymentRoute)
	.use(serviceRoute)
	.use(ingressRoute)
	.use(configmapRoute)
	.use(secretRoute)
	.use(pvcRoute)
	.use(roleRoute);

export { apiRouter };
