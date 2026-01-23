import { Elysia } from "elysia";
import { authenticationMiddleware } from "../middleware/auth";
import { db } from "../database";
import { schema } from "../database/schema";
import { baseResponseSchema, errorResponseSchema } from "../types";
import { Type } from "@sinclair/typebox";
import { dbSchemaTypes } from "../database/type";
import { eq } from "drizzle-orm";
import { agentManagerService } from "../services/agentManager";
import { Command,Command_CommandType } from "../../pb-generated/agent-backend/websocket";

export const nodesRoute = new Elysia({ prefix: "/nodes/:clusterId" })
	.use(authenticationMiddleware)
	.use(agentManagerService)
	.guard(
		{
			userAuth: {
				requiredProfile: true,
			},
			roleAuth: ["manager"],
		},
		(app) =>
			app
				.get(
					"/token",
					async (ctx) => {
						const clusterId = Number(ctx.params.clusterId);
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
								message: "Cluster or agent not found",
								timestamp: Date.now(),
							});
						}

						try {
							const response = await ctx.agentManager.sendCommand(
								cluster.agent.id,
								{
									id: "", // Will be filled by sendCommand
									type: Command_CommandType.GET_JOIN_TOKEN,
									payload: "",
									targetNamespace: "",
									targetName: "",
								},
							);

							if (!response.success) {
								return ctx.status(500, {
									success: false,
									message: response.error || "Failed to get join token",
									timestamp: Date.now(),
								});
							}

							let joinData = {
								command: "",
								token: "",
								discoveryTokenCaCertHash: "",
								apiServerEndpoint: "",
								expiration: "",
							};

							try {
								if (response.data) {
									joinData = JSON.parse(response.data);
								}
							} catch (e) {
								console.error("Failed to parse join token data JSON:", e);
								// Fallback if it's just a string or fails
								joinData.command = response.data;
							}

							return ctx.status(200, {
								success: true,
								message: "Node join token fetched successfully",
								data: {
									...joinData,
									clusterId: cluster.id,
								},
								timestamp: Date.now(),
							});
						} catch (error: unknown) {
							return ctx.status(500, {
								success: false,
								message:
									error instanceof Error
										? error.message
										: "Internal Server Error",
								timestamp: Date.now(),
							});
						}
					},
					{
						detail: {
							tags: ["Nodes"],
						},
						response: {
							200: baseResponseSchema(
								Type.Object({
									command: Type.String(),
									token: Type.String(),
									discoveryTokenCaCertHash: Type.String(),
									apiServerEndpoint: Type.String(),
									expiration: Type.String(),
									clusterId: Type.Number(),
								}),
							),
							404: errorResponseSchema,
							500: errorResponseSchema,
						},
					},
				)
				.delete(
					"/:id",
					async (ctx) => {
						const nodeId = Number(ctx.params.id);
						const clusterId = Number(ctx.params.clusterId);

						const node = await db.query.k8sClusterNode.findFirst({
							where: {
								id: nodeId,
								clusterId: clusterId,
							},
						});

						if (!node) {
							return ctx.status(404, {
								success: false,
								message: "Node not found",
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
							// Send DELETE command to Agent
							await ctx.agentManager.sendCommand(cluster.agent.id, {
								id: "", // Will be filled by sendCommand
								type: 7, // DELETE_NODE (pb.Command_CommandType.DELETE_NODE)
								targetName: node.name,
								payload: "",
								targetNamespace: "",
							});

							// Proceed to delete from DB only after agent confirms success
							await db
								.delete(schema.k8sClusterNode)
								.where(eq(schema.k8sClusterNode.id, nodeId));
						} catch (error: unknown) {
							return ctx.status(500, {
								success: false,
								message: `Agent error: ${error instanceof Error ? error.message : "Unknown error"}`,
								timestamp: Date.now(),
							});
						}

						return ctx.status(200, {
							success: true,
							message: "Node deleted successfully",
							data: node,
							timestamp: Date.now(),
						});
					},
					{
						detail: {
							tags: ["Nodes"],
						},
						response: {
							200: baseResponseSchema(
								Type.Object(dbSchemaTypes.k8sClusterNode),
							),
							404: errorResponseSchema,
							500: errorResponseSchema,
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
								labels: lable,
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
								lable: dbSchemaTypes.k8sClusterNode.labels,
							}),
						),
						response: {
							200: baseResponseSchema(
								Type.Object(dbSchemaTypes.k8sClusterNode),
							),
							404: errorResponseSchema,
						},
					},
				)
				.get(
					"/",
					async (ctx) => {
						const clusterId = Number(ctx.params.clusterId);
						const cluster = await db.query.k8sClusterNode.findMany({
							where: {
								clusterId: clusterId,
							},
						});

						if (!cluster) {
							return ctx.status(404, {
								success: false,
								message: "Cluster or agent not found",
								timestamp: Date.now(),
							});
						}

						return ctx.status(200, {
							success: true,
							message: "Node join token fetched successfully",
							data: cluster,
							timestamp: Date.now(),
						});
					},
					{
						detail: {
							tags: ["Nodes"],
						},
						response: {
							200: baseResponseSchema(
								Type.Array(Type.Object(dbSchemaTypes.k8sClusterNode)),
							),
							404: errorResponseSchema,
						},
					},
				),
	);
