import Elysia, { type Static } from "elysia";
import { auth } from "../libs/auths/auth.config";
import { eq } from "drizzle-orm";
import { db } from "../database";
import { schema } from "../database/schema";
import type { dbSchemaTypes } from "../database/type";
import { isAllElementsPresent } from "../utils/array";

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
	roleAuth: (permissions: Static<typeof dbSchemaTypes.profile.permission>) => ({
		async resolve({ status, request: { headers } }) {
			const session = await auth.api.getSession({
				headers,
			});

			if (!session) return status(401);

			const userProfile = await db
				.select()
				.from(schema.profile)
				.where(eq(schema.profile.userId, session.user.id));
			if (!userProfile || !userProfile[0]) return status(401);

			const userPermissions = userProfile[0].permission;
			if (!userPermissions) return status(401);
			if (userPermissions.includes("admin"))
				return {
					user: session.user,
					session: session.session,
					permission: userPermissions,
					profile: userProfile[0],
				};
			// if all permissions are in userPermissions return true
			if (isAllElementsPresent(permissions, userPermissions))
				return {
					user: session.user,
					session: session.session,
					permission: userPermissions,
					profile: userProfile[0],
				};
			return status(403);
		},
	}),
});
