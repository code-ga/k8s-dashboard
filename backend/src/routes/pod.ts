/** biome-ignore-all lint/suspicious/noExplicitAny: <explanation> */
import { Type } from "@sinclair/typebox";
import { Elysia } from "elysia";
import { db } from "../database";
import { dbSchemaTypes } from "../database/type";
import { authenticationMiddleware, checkPermission } from "../middleware/auth";
import { agentManagerService } from "../services/agentManager";
import { baseResponseSchema, errorResponseSchema } from "../types";
import { schema } from "../database/schema";
import { eq } from "drizzle-orm";

export const podRoute = new Elysia({
	prefix: "/pods/:clusterId",
	detail: { tags: ["Pods"] },
})
	.use(authenticationMiddleware)
	.use(agentManagerService)
	.guard({ roleAuth: ["manager"] }, (app) =>
		app.get(
			"/all",
			async (ctx) => {
				const { clusterId } = ctx.params;
				if (!clusterId) {
					return ctx.status(400, {
						success: false,
						message: "Cluster ID is required",
						timestamp: Date.now(),
					});
				}
				const cluster = await db.query.k8sCluster.findFirst({
					where: {
						id: Number(clusterId),
					},
				});
				if (!cluster) {
					return ctx.status(404, {
						success: false,
						message: "Cluster not found",
						timestamp: Date.now(),
					});
				}
				const pods = await db.query.k8sPods.findMany({
					where: {
						clusterId: Number(clusterId),
					},
				});
				return ctx.status(200, {
					success: true,
					message: "Pod fetched successfully",
					data: pods,
					timestamp: Date.now(),
				});
			},
			{
				detail: { tags: ["Pods"] },
				response: {
					200: baseResponseSchema(
						Type.Array(Type.Object(dbSchemaTypes.k8sPods)),
					),
					404: errorResponseSchema,
					400: errorResponseSchema,
				},
			},
		),
	)
	.guard({ userAuth: { requiredProfile: true } }, (app) =>
		app
			.get(
				"/",
				async (ctx) => {
					const { clusterId } = ctx.params;
					if (!clusterId) {
						return ctx.status(400, {
							success: false,
							message: "Cluster ID is required",
							timestamp: Date.now(),
						});
					}
					const cluster = await db.query.k8sCluster.findFirst({
						where: {
							id: Number(clusterId),
						},
					});
					if (!cluster) {
						return ctx.status(404, {
							success: false,
							message: "Cluster not found",
							timestamp: Date.now(),
						});
					}
					const pods = await db.query.k8sPods.findMany({
						where: {
							owner: {
								id: ctx.profile?.id,
							},
							clusterId: Number(clusterId),
						},
					});
					return ctx.status(200, {
						success: true,
						message: "Pod fetched successfully",
						data: pods,
						timestamp: Date.now(),
					});
				},
				{
					detail: { tags: ["Pods"] },
					response: {
						200: baseResponseSchema(
							Type.Array(Type.Object(dbSchemaTypes.k8sPods)),
						),
						404: errorResponseSchema,
						400: errorResponseSchema,
					},
				},
			)
			.get(
				"/namespaces",
				async (ctx) => {
					const { clusterId } = ctx.params;
					if (!clusterId) {
						return ctx.status(400, {
							success: false,
							message: "Cluster ID is required",
							timestamp: Date.now(),
						});
					}
					const cluster = await db.query.k8sCluster.findFirst({
						where: {
							id: Number(clusterId),
						},
					});
					if (!cluster) {
						return ctx.status(404, {
							success: false,
							message: "Cluster not found",
							timestamp: Date.now(),
						});
					}
					const namespaces = await db.query.k8sPods.findMany({
						where: {
							owner: {
								id: ctx.profile?.id,
							},
							clusterId: Number(clusterId),
						},
						columns: {
							namespace: true,
						},
					});
					return ctx.status(200, {
						success: true,
						message: "Namespaces fetched successfully",
						data: namespaces,
						timestamp: Date.now(),
					});
				},
				{
					detail: { tags: ["Pods"] },
					response: {
						200: baseResponseSchema(
							Type.Array(Type.Object({ namespace: Type.String() })),
						),
						404: errorResponseSchema,
						400: errorResponseSchema,
					},
				},
			)
			.get(
				"/:id",
				async (ctx) => {
					const { clusterId, id } = ctx.params;
					if (!clusterId || !id) {
						return ctx.status(400, {
							success: false,
							message: "Cluster ID and Pod ID are required",
							timestamp: Date.now(),
						});
					}
					const pod = await db.query.k8sPods.findFirst({
						where: {
							id: Number(id),
							owner: checkPermission(ctx.profile?.permission || [], ["manager"])
								? {
										id: ctx.profile?.id,
									}
								: undefined,
							clusterId: Number(clusterId),
						},
					});
					if (!pod) {
						return ctx.status(404, {
							success: false,
							message: "Pod not found",
							timestamp: Date.now(),
						});
					}
					return ctx.status(200, {
						success: true,
						message: "Pod fetched successfully",
						data: pod,
						timestamp: Date.now(),
					});
				},
				{
					detail: { tags: ["Pods"] },
					response: {
						200: baseResponseSchema(Type.Object(dbSchemaTypes.k8sPods)),
						404: errorResponseSchema,
						400: errorResponseSchema,
					},
				},
			)
			.post(
				"/",
				async (ctx) => {
					const clusterId = Number(ctx.params.clusterId);
					const { manifest } = ctx.body;

					const cluster = await db.query.k8sCluster.findFirst({
						where: {
							id: clusterId,
						},
						with: {
							agent: true,
						},
					});

					if (!cluster || !cluster.agent) {
						return ctx.status(404, {
							success: false,
							message: "Cluster not found",
							timestamp: Date.now(),
						});
					}

					try {
						const response = await ctx.agentManager.sendCommand(
							cluster.agent.id,
							cluster.id,
							{
								id: crypto.randomUUID(),
								type: 5, // CREATE_POD
								payload: manifest,
								targetNamespace: "",
								targetName: "",
							},
						);

						return ctx.status(201, {
							success: true,
							message: "Pod creation command sent",
							data: response.data,
							timestamp: Date.now(),
						});
					} catch (error: any) {
						return ctx.status(500, {
							success: false,
							message: `Agent error: ${error.message}`,
							timestamp: Date.now(),
						});
					}
				},
				{
					detail: { tags: ["Pods"] },
					body: Type.Object({
						manifest: Type.String(),
					}),
					response: {
						201: baseResponseSchema(Type.Optional(Type.String())),
						404: errorResponseSchema,
						500: errorResponseSchema,
					},
				},
			)
			.delete(
				"/:id",
				async (ctx) => {
					const podId = Number(ctx.params.id);
					const clusterId = Number(ctx.params.clusterId);

					const pod = await db.query.k8sPods.findFirst({
						where: {
							id: podId,
							clusterId: clusterId,
						},
					});

					if (!pod) {
						return ctx.status(404, {
							success: false,
							message: "Pod not found",
							timestamp: Date.now(),
						});
					}

					const cluster = await db.query.k8sCluster.findFirst({
						where: {
							id: clusterId,
						},
						with: {
							agent: true,
						},
					});

					if (!cluster || !cluster.agent) {
						return ctx.status(404, {
							success: false,
							message: "Cluster not found",
							timestamp: Date.now(),
						});
					}

					try {
						await ctx.agentManager.sendCommand(cluster.agentId, cluster.id, {
							id: crypto.randomUUID(),
							type: 6, // DELETE_POD
							targetNamespace: pod.namespace,
							targetName: pod.name,
							payload: "",
						});

						await db.delete(schema.k8sPods).where(eq(schema.k8sPods.id, podId));

						return ctx.status(200, {
							success: true,
							message: "Pod deleted successfully",
							data: pod,
							timestamp: Date.now(),
						});
					} catch (error: any) {
						return ctx.status(500, {
							success: false,
							message: `Agent error: ${error.message}`,
							timestamp: Date.now(),
						});
					}
				},
				{
					detail: { tags: ["Pods"] },
					response: {
						200: baseResponseSchema(Type.Object(dbSchemaTypes.k8sPods)),
						404: errorResponseSchema,
						500: errorResponseSchema,
					},
				},
			)
			.patch(
				"/:id",
				async (ctx) => {
					const clusterId = Number(ctx.params.clusterId);
					const { manifest } = ctx.body;

					const cluster = await db.query.k8sCluster.findFirst({
						where: {
							id: clusterId,
						},
						with: {
							agent: true,
						},
					});

					if (!cluster || !cluster.agent) {
						return ctx.status(404, {
							success: false,
							message: "Cluster not found",
							timestamp: Date.now(),
						});
					}

					try {
						const response = await ctx.agentManager.sendCommand(
							cluster.agentId,
							cluster.id,
							{
								id: crypto.randomUUID(),
								type: 1, // EDIT_RESOURCE
								payload: manifest,
								targetNamespace: "",
								targetName: "",
							},
						);

						return ctx.status(200, {
							success: true,
							message: "Pod update command sent",
							data: response.data,
							timestamp: Date.now(),
						});
					} catch (error: any) {
						return ctx.status(500, {
							success: false,
							message: `Agent error: ${error.message}`,
							timestamp: Date.now(),
						});
					}
				},
				{
					detail: { tags: ["Pods"] },
					body: Type.Object({
						manifest: Type.String(),
					}),
					response: {
						200: baseResponseSchema(Type.Optional(Type.String())),
						404: errorResponseSchema,
						500: errorResponseSchema,
					},
				},
			),
	);
