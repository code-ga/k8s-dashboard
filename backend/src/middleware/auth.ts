import { eq } from "drizzle-orm";
import Elysia from "elysia";
import {
	evaluatePermissionFilter,
	resolveUserPermissions,
	type PermissionFilter,
} from "../constants/permissions";
import { db } from "../database";
import { schema } from "../database/schema";
import { auth } from "../libs/auths/auth.config";
import { logger } from "../utils/logger";

export const authenticationMiddleware = new Elysia({
	name: "authentication",
}).macro({
	userAuth: (config: { requiredProfile: boolean }) => ({
		async resolve({ status, request: { headers, url } }) {
			logger.info("Authentication middleware");
			logger.info("Path: ", url);
			const session = await auth.api.getSession({
				headers,
			});

			if (!session) return status(401, { success: false, message: "Unauthorized" });
			const profile = await db.query.profile.findFirst({
				where: {
					userId: session.user.id,
				},
			});
			if (config.requiredProfile && !profile) return status(401);
			return {
				user: session.user,
				session: session.session,
				profile,
			};
		},
	}),

	agentAuth: {
		async resolve({ status, request: { headers } }) {
			logger.info("Agent authentication middleware");
			const authenticationHeader = headers.get("Authorization");
			logger.info("Authentication header: ", authenticationHeader);
			if (!authenticationHeader || !authenticationHeader.startsWith("Bot ")) {
				return status(401, { success: false, message: "Unauthorized" });
			}
			const token = authenticationHeader.replace("Bot ", "").trim();
			logger.info("Received token: ", token);
			const agent = await db
				.select()
				.from(schema.clusterAgent)
				.where(eq(schema.clusterAgent.token, token))
				.limit(1);

			if (agent.length === 0 || !agent[0]) {
				logger.info("Agent not found");
				return status(401, { success: false, message: "Unauthorized" });
			}
			const cluster = await db
				.select()
				.from(schema.k8sCluster)
				.where(eq(schema.k8sCluster.agentId, agent[0].id))
				.limit(1);
			if (cluster.length === 0 || !cluster[0]) {
				logger.info("Cluster not found");
				return status(401, { success: false, message: "Unauthorized" });
			}
			return {
				agent: agent[0],
				cluster: cluster[0], 
			};
		},
	},
	roleAuth: (filter: PermissionFilter) => ({
		async resolve({ status, request: { headers } }) {
			const session = await auth.api.getSession({ headers });
			if (!session) return status(401, { success: false, message: "Unauthorized" });

			const profile = await db.query.profile.findFirst({
				where: { userId: session.user.id },
			});
			if (!profile) return status(401, { success: false, message: "Unauthorized" });

			const userPermissions = await resolveUserPermissions(profile.rolesIDs);
			if (!evaluatePermissionFilter(userPermissions, filter))
				return status(403, { success: false, message: "Forbidden" });

			return {
				user: session.user,
				session: session.session,
				profile,
				userPermissions, // Set<Permission> available in route handlers
			};
		},
		detail: {
			tags: ["auth"],
			"x-permission": filter, // picked up by /route-permissions endpoint
		},
	}),
});
