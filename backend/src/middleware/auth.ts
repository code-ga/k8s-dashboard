import Elysia from "elysia";
import { auth } from "../libs/auths/auth.config";
import { eq } from "drizzle-orm";
import { db } from "../database";
import { schema } from "../database/schema";

export const authenticationMiddleware = new Elysia({
	name: "authentication",
}).macro({
	userAuth: {
		async resolve({ status, request: { headers } }) {
			const session = await auth.api.getSession({
				headers,
			});

			if (!session) return status(401);

			return {
				user: session.user,
				session: session.session,
			};
		},
	},
	agentAuth: {
		async resolve({ status, request: { headers } }) {
			const authenticationHeader = headers.get("Authorization");
			if (!authenticationHeader || !authenticationHeader.startsWith("Bot ")) {
				return status(401);
			}
			const token = authenticationHeader.replace("Bot ", "").trim();
			const agent = await db
				.select()
				.from(schema.clusterAgent)
				.where(eq(schema.clusterAgent.token, token))
				.limit(1);
			if (agent.length === 0 || !agent[0]) {
				return status(401);
			}
			const cluster = await db
				.select()
				.from(schema.k8sCluster)
				.where(eq(schema.k8sCluster.agentId, agent[0].id))
				.limit(1);
			if (cluster.length === 0 || !cluster[0]) {
				return status(401);
			}
			return {
				agent: agent[0],
				cluster: cluster[0],
			};
		},
	},
	adminAuth: (role: string) => ({
		async resolve({ status, request: { headers } }) {
			const session = await auth.api.getSession({
				headers,
			});

			if (!session) return status(401);
			const userRole = await db
				.select()
				.from(schema.userRole)
				.where(eq(schema.userRole.userId, session.user.id))
				.limit(1);
			if (userRole.length === 0 || !userRole[0]) {
				return status(401);
			}
			if (userRole[0].role !== role) {
				return status(401);
			}
			return {
				userRole: userRole[0],
			};
		},
	}),
});
