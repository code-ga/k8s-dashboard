import Elysia from "elysia";
import { agentManagerService } from "../services/agentManager";
import { agentRoute } from "./agent";
import { clusterRoute } from "./cluster";
import { configmapRoute } from "./configmap";
import { deploymentRoute } from "./deployment";
import { healthRoutes } from "./health";
import { ingressRoute } from "./ingress";
import { nodesRoute } from "./nodes";
import { podRoute } from "./pod";
import { profileRouter } from "./profile";
import { pvRoute } from "./pv";
import { pvcRoute } from "./pvc";
import { roleRoute } from "./role";
import { secretRoute } from "./secret";
import { serviceRoute } from "./service";
import { storageclassRoute } from "./storageclass";

const apiRouter = new Elysia({ prefix: "/api" })
	.use(agentManagerService)
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
	.use(pvRoute)
	.use(storageclassRoute)
	.use(roleRoute);

export { apiRouter };
