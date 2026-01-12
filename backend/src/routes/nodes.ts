import { Elysia } from "elysia";
import { authenticationMiddleware } from "../middleware/auth";
import { db } from "../database";
import { schema } from "../database/schema";
import { baseResponseSchema, errorResponseSchema } from "../types";
import { Type } from "@sinclair/typebox";
import { dbSchemaTypes } from "../database/type";
import { eq } from "drizzle-orm";
import { agentManagerService } from "../services/agentManager";

export const nodesRoute = new Elysia({ prefix: "/nodes" })
	.use(authenticationMiddleware)
	.use(agentManagerService)
	.guard(
		{
			userAuth: true,
			adminAuth:"admin"
		},
		(app) =>
			app
				.get(
					"/token/:clusterId",
					async (ctx) => {
						const clusterId = Number(ctx.params.clusterId);
						const cluster = await db.query.k8sCluster.findFirst({
							where: eq(schema.k8sCluster.id, clusterId),
							with: {
								agent: true,
							},
						});

						if (!cluster || !cluster.agent) {
							return ctx.status(404, {
								success: false,
								message: "Cluster or agent not found",
								timestamp: Date.now(),
							});
						}

						// We assume the Cluster Agent Token is the Join Token for the cluster
						return ctx.status(200, {
							success: true,
							message: "Node join token fetched successfully",
							data: {
								token: cluster.agent.token,
								clusterId: cluster.id,
							},
							timestamp: Date.now(),
						});
					},
					{
						detail: {
							tags: ["Nodes"],
						},
						response: {
							200: baseResponseSchema(
								Type.Object({
									token: Type.String(),
									clusterId: Type.Number(),
								}),
							),
							404: errorResponseSchema,
						},
					},
				)
				.delete(
					"/:id",
					async (ctx) => {
						const nodeId = Number(ctx.params.id);
						const node = await db
							.delete(schema.k8sClusterNode)
							.where(eq(schema.k8sClusterNode.id, nodeId))
							.returning();

						if (node.length === 0 || !node[0]) {
							return ctx.status(404, {
								success: false,
								message: "Node not found",
								timestamp: Date.now(),
							});
						}

						// TODO: Send DELETE command to Agent if supported
						// const cluster = await db.query.k8sCluster.findFirst({ where: eq(schema.k8sCluster.id, node[0].clusterId) });
						// if (cluster) {
						//    ctx.agentManager.sendCommand(cluster.agentId, "DELETE_NODE", { node: node[0].name });
						// }

						return ctx.status(200, {
							success: true,
							message: "Node deleted successfully",
							data: node[0],
							timestamp: Date.now(),
						});
					},
					{
						detail: {
							tags: ["Nodes"],
						},
						response: {
							200: baseResponseSchema(Type.Object(dbSchemaTypes.k8sClusterNode)),
							404: errorResponseSchema,
						},
					},
				)
				.patch(
					"/:id",
					async (ctx) => {
						const nodeId = Number(ctx.params.id);
						const { name, lable } = ctx.body;

						const node = await db
							.update(schema.k8sClusterNode)
							.set({
								name,
								lable,
								updatedAt: new Date(),
							})
							.where(eq(schema.k8sClusterNode.id, nodeId))
							.returning();

						if (node.length === 0 || !node[0]) {
							return ctx.status(404, {
								success: false,
								message: "Node not found",
								timestamp: Date.now(),
							});
						}

						return ctx.status(200, {
							success: true,
							message: "Node updated successfully",
							data: node[0],
							timestamp: Date.now(),
						});
					},
					{
						detail: {
							tags: ["Nodes"],
						},
						body: Type.Partial(
							Type.Object({
								name: dbSchemaTypes.k8sClusterNode.name,
								lable: dbSchemaTypes.k8sClusterNode.lable,
							}),
						),
						response: {
							200: baseResponseSchema(Type.Object(dbSchemaTypes.k8sClusterNode)),
							404: errorResponseSchema,
						},
					},
				),
	);
