import Elysia from "elysia";
import { authenticationMiddleware } from "../middleware/auth";
import { db } from "../database";
import { schema } from "../database/schema";
import { baseResponseSchema, errorResponseSchema } from "../types";
import { Type } from "@sinclair/typebox";
import { dbSchemaTypes } from "../database/type";
import { eq } from "drizzle-orm";
import { agentManagerService } from "../services/agentManager";
import { agentService } from "../services/agent.service";
import { AgentPayload, ServerPayload } from "../../pb-generated/agent-backend/websocket";

export const agentRoute = new Elysia({ prefix: "/agents" })
	.use(authenticationMiddleware)
	.use(agentManagerService)
	.onStart(async (app) => {
		console.log(app.decorator.agentManager.instanceId);
		// You can initialize connections or other resources here
	})
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
							where: eq(schema.k8sCluster.id, cluster.id),
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
							data: clusterInfo,
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
						},
					},
				)
				.post("/cluster-info",	async(ctx)=>{
					const cluster = ctx.cluster;
					const clusterInfo = await db.query.k8sCluster.findFirst({
						where: eq(schema.k8sCluster.id, cluster.id),
					});
					if (!clusterInfo) {
						return ctx.status(404, {
							success: false,
							message: "Cluster not found",
							timestamp: Date.now(),
						});
					}
					// Update cluster info
					const updatedClusterInfo = await db.update(schema.k8sCluster).set({
						name: clusterInfo.name,
						description: clusterInfo.description,
						tags: clusterInfo.tags,
						clusterDomain: clusterInfo.clusterDomain,
						enableS3Service: clusterInfo.enableS3Service,
					}).where(eq(schema.k8sCluster.id, cluster.id)).returning();
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
				},{
					detail:{
						tags:["Agent"],
					},
					response:{
						200:baseResponseSchema(Type.Object(dbSchemaTypes.k8sCluster)),
						400:errorResponseSchema,
						401:errorResponseSchema,
						404:errorResponseSchema,
						500:errorResponseSchema,
						body:Type.Partial(
							Type.Object({
								name: dbSchemaTypes.k8sCluster.name,
								description: dbSchemaTypes.k8sCluster.description,
								tags: dbSchemaTypes.k8sCluster.tags,
								enableS3Service: dbSchemaTypes.k8sCluster.enableS3Service,
								clusterDomain: dbSchemaTypes.k8sCluster.clusterDomain,
							}),
						)
					},
				})
				.ws("/ws", {
					detail: {
						tags: ["Agent"],
					},
					body: Type.Any(),
					open: async (ctx) => {
						const cluster = ctx.data.cluster;
						const agent = ctx.data.agent;
						console.log(
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

						// Message is expected to be Uint8Array (binary)
						if (!(message instanceof Uint8Array) && !Buffer.isBuffer(message)) {
							console.log("Received non-binary message");
							return;
						}

						try {
							// Decode Protobuf
							const payload = AgentPayload.decode(new Uint8Array(message as any));

							if (payload.heartbeat) {
								const response = await agentService.handleHeartbeat(agent.id, payload.heartbeat);
								if (response) {
									// Send Command back
									const responseBytes = ServerPayload.encode(response).finish();
									ws.send(responseBytes);
								}
							}
						} catch (error) {
							console.error(
								`Failed to decode or process message from cluster ${cluster.name} (${cluster.id}):`,
								error,
							);
						}
					},
					close: async (ctx) => {
						const cluster = ctx.data.cluster;
						const agent = ctx.data.agent;
						console.log(
							`Agent ${agent.id} disconnected for cluster ${cluster.name} (${cluster.id})`,
						);
						ctx.data.agentManager.emit("agent/disconnected", {
							agentId: `${agent.id}`,
						});
                        // Remove connection
                        ctx.data.agentManager.removeConnection(agent.id);
						// Clean up any resources related to the disconnected agent here
						await agentService.agentDisconnect(agent.id);
					},
				}),
	);

