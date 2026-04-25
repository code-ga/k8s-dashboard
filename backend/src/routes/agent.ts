import { logger } from "../utils/logger";
import { Type } from "@sinclair/typebox";
import { eq } from "drizzle-orm";
import Elysia from "elysia";
import { AgentPayload } from "../../pb-generated/agent-backend/websocket";
import { db } from "../database";
import { schema } from "../database/schema";
import { dbSchemaTypes } from "../database/type";
import { authenticationMiddleware } from "../middleware/auth";
import { agentService } from "../services/agent.service";
import { agentManagerService } from "../services/agentManager";
import { baseResponseSchema, errorResponseSchema } from "../types";

export const agentRoute = new Elysia({ prefix: "/agents" })
	.use(authenticationMiddleware)
	.use(agentManagerService)
	.guard(
		{
			agentAuth: true,
		},
		(app) =>
			app
				.get(
					"/config",
					async (ctx) => {
						const cluster = ctx.cluster;
						return ctx.status(200, {
							success: true,
							message: "Cluster agent config fetched successfully",
							data: {
								clusterId: cluster.id,
								clusterName: cluster.name,
								clusterToken: ctx.agent.token,
							},
							timestamp: Date.now(),
						});
					},
					{
						detail: {
							tags: ["Agent"],
						},
						response: {
							200: baseResponseSchema(
								Type.Object({
									clusterId: dbSchemaTypes.k8sCluster.id,
									clusterName: dbSchemaTypes.k8sCluster.name,
									clusterToken: dbSchemaTypes.clusterAgent.token,
								}),
							),
							400: errorResponseSchema,
							401: errorResponseSchema,
							500: errorResponseSchema,
						},
					},
				)
				.get(
					"/cluster-info",
					async (ctx) => {
						const cluster = ctx.cluster;
						const clusterInfo = await db.query.k8sCluster.findFirst({
							where: {
								id: cluster.id,
							},
						});
						if (!clusterInfo) {
							return ctx.status(404, {
								success: false,
								message: "Cluster not found",
								timestamp: Date.now(),
							});
						}
						return ctx.status(200, {
							success: true,
							message: "Cluster info fetched successfully",
							data: {
								...clusterInfo,
								clusterKey: process.env.MASTER_KEY || "",
							},
							timestamp: Date.now(),
						});
					},
					{
						detail: {
							tags: ["Agent"],
						},
						response: {
							200: baseResponseSchema(
								Type.Intersect([
									Type.Object(dbSchemaTypes.k8sCluster),
									Type.Object({ clusterKey: Type.String() }),
								]),
							),
							400: errorResponseSchema,
							401: errorResponseSchema,
							404: errorResponseSchema,
							500: errorResponseSchema,
						},
					},
				)
				.post(
					"/cluster-info",
					async (ctx) => {
						const cluster = ctx.cluster;
						const clusterInfo = await db.query.k8sCluster.findFirst({
							where: {
								id: cluster.id,
							},
						});
						if (!clusterInfo) {
							return ctx.status(404, {
								success: false,
								message: "Cluster not found",
								timestamp: Date.now(),
							});
						}
						// Update cluster info
						const updatedClusterInfo = await db
							.update(schema.k8sCluster)
							.set({
								name: clusterInfo.name,
								description: clusterInfo.description,
								tags: clusterInfo.tags,
								clusterDomain: clusterInfo.clusterDomain,
								enableS3Service: clusterInfo.enableS3Service,
							})
							.where(eq(schema.k8sCluster.id, cluster.id))
							.returning();
						if (!updatedClusterInfo || !updatedClusterInfo[0]) {
							return ctx.status(404, {
								success: false,
								message: "Cluster not found",
								timestamp: Date.now(),
							});
						}
						return ctx.status(200, {
							success: true,
							message: "Cluster info updated successfully",
							data: updatedClusterInfo[0],
							timestamp: Date.now(),
						});
					},
					{
						detail: {
							tags: ["Agent"],
						},
						response: {
							200: baseResponseSchema(Type.Object(dbSchemaTypes.k8sCluster)),
							400: errorResponseSchema,
							401: errorResponseSchema,
							404: errorResponseSchema,
							500: errorResponseSchema,
							body: Type.Partial(
								Type.Object({
									name: dbSchemaTypes.k8sCluster.name,
									description: dbSchemaTypes.k8sCluster.description,
									tags: dbSchemaTypes.k8sCluster.tags,
									enableS3Service: dbSchemaTypes.k8sCluster.enableS3Service,
									clusterDomain: dbSchemaTypes.k8sCluster.clusterDomain,
								}),
							),
						},
					},
				)
				.ws("/ws", {
					detail: {
						tags: ["Agent"],
					},
					body: Type.Any(),
					agentAuth: true,
					open: async (ctx) => {
						const cluster = ctx.data.cluster;
						const agent = ctx.data.agent;
						logger.info(
							`Agent ${agent.id} connected for cluster ${cluster.name} (${cluster.id})`,
						);
						ctx.data.agentManager.emit("agent/connected", {
							agentId: `${agent.id}`,
						});
						// Register connection
						ctx.data.agentManager.registerConnection(agent.id, ctx);
						// Here you can store the WebSocket connection for later use
					},
					message: async (ws, message) => {
						const cluster = ws.data.cluster;
						const agent = ws.data.agent;
						logger.info(
							`Received message from agent ${agent.id} for cluster ${cluster.name} (${cluster.id})`,
						);
						// if (!cluster || !agent) {
						// 	logger.info("No cluster or agent info in WebSocket context");
						// 	return;
						// }

						// Message is expected to be Uint8Array (binary)
						if (!(message instanceof Uint8Array) && !Buffer.isBuffer(message)) {
							logger.info("Received non-binary message");
							return;
						}

						try {
							// Decode Protobuf
							const payload = AgentPayload.decode(new Uint8Array(message));

							if (payload.heartbeat) {
								await agentService.handleHeartbeat(
									agent.id,
									payload.heartbeat,
									ws.data.agentManager,
								);
							}

							if (payload.commandResponse) {
								ws.data.agentManager.handleCommandResponse(
									payload.commandResponse,
								);
							}
							if (payload.streamData) {
								ws.data.agentManager.handleStreamData(payload.streamData);
							}
							if (payload.authorizeUser) {
								const agent = await db
									.select()
									.from(schema.clusterAgent)
									.where(
										eq(schema.clusterAgent.token, payload.authorizeUser.token),
									)
									.limit(1);
								if (agent.length === 0 || !agent[0]) {
									ws.send(
										JSON.stringify({
											success: false,
											message: "Unauthorized",
										}),
									);
									ws.close();
									return;
								}
								const cluster = await db
									.select()
									.from(schema.k8sCluster)
									.where(eq(schema.k8sCluster.agentId, agent[0].id))
									.limit(1);
								if (cluster.length === 0 || !cluster[0]) {
									ws.send(
										JSON.stringify({
											success: false,
											message: "Unauthorized",
										}),
									);
									ws.close();
									return;
								}
								ws.data.cluster = cluster[0];
								ws.data.agent = agent[0];
								logger.info(
									`Agent ${agent[0].id} connected for cluster ${cluster[0].name} (${cluster[0].id})`,
								);
								ws.data.agentManager.emit("agent/connected", {
									agentId: `${agent[0].id}`,
								});
								// Register connection
								ws.data.agentManager.registerConnection(agent[0].id, ws);
								// Here you can store the WebSocket connection for later use
							}
							// Handle other message types similarly
							// ...
						} catch (error) {
							logger.error(
								`Failed to decode or process message from cluster ${cluster.name} (${cluster.id}):`,
								error,
							);
						}
					},
					close: async (ctx) => {
						const cluster = ctx.data.cluster;
						const agent = ctx.data.agent;

						// Remove connection
						ctx.data.agentManager.removeConnection(agent.id, ctx);
						ctx.data.agentManager.emit("agent/disconnected", {
							agentId: `${agent.id}`,
						});
						// Clean up any resources related to the disconnected agent here
						await agentService.agentDisconnect(agent.id);
						logger.info(
							`Agent ${agent.id} disconnected for cluster ${cluster.name} (${cluster.id})`,
						);
					},
				}),
	);
