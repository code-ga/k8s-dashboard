import Elysia from "elysia";
import { Type } from "@sinclair/typebox";
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
import { baseResponseSchema } from "../types";

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
	.use(roleRoute)
	.get("/server-url", async (ctx) => {
		const backendUrlEnv = process.env.BACKEND_URL;
		let serverUrl: string;
		if (backendUrlEnv) {
			// Take the first non-empty URL if comma-separated
			const firstUrl = backendUrlEnv.split(",").find((url) => url.trim().length > 0);
			if (firstUrl) {
				serverUrl = firstUrl.trim();
			} else {
				const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
				serverUrl = `${protocol}://localhost:${process.env.PORT || 3001}`;
			}
		} else {
			const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
			serverUrl = `${protocol}://localhost:${process.env.PORT || 3001}`;
		}
		return ctx.status(200, {
			success: true,
			message: "Server URL fetched successfully",
			data: { url: serverUrl },
			timestamp: Date.now(),
		});
	}, {
		response: {
			200: baseResponseSchema(Type.Object({ url: Type.String() })),
		},
	});

export { apiRouter };
