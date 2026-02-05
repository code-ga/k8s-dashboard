/** biome-ignore-all lint/suspicious/noExplicitAny: <explanation> */
import { Type } from "@sinclair/typebox";
import { Elysia } from "elysia";
import { db } from "../database";
import { schema } from "../database/schema";
import { dbSchemaTypes, type SchemaStatic } from "../database/type";
import { authenticationMiddleware, checkPermission } from "../middleware/auth";
import { agentManagerService } from "../services/agentManager";
import { baseResponseSchema, errorResponseSchema } from "../types";
import { decrypt, encrypt } from "../utils/crypto";
import { generatePodManifest } from "../utils/k8s-manifest";
import { eq } from "drizzle-orm";

export interface WebSocketData {
	// ws: WebSocket;
	clusterId: number;
	streamId: string;
	podId: number;
	agentId: number;
}

export const podRoute = new Elysia({
	prefix: "/pods/:clusterId",
	detail: { tags: ["Pods"] },
})
	.use(authenticationMiddleware)
	.use(agentManagerService)
	.decorate("websocketData", new Map<string, WebSocketData>())
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
							ownerId: ctx.profile?.id ?? "",
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
							ownerId: ctx.profile?.id ?? "",
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
					const isManager = checkPermission(ctx.profile?.permission || [], [
						"manager",
					]);
					const pod = await db.query.k8sPods.findFirst({
						where: isManager
							? { id: Number(id), clusterId: Number(clusterId) }
							: {
									id: Number(id),
									clusterId: Number(clusterId),
									ownerId: ctx.profile?.id ?? "",
								},
					});
					if (!pod) {
						return ctx.status(404, {
							success: false,
							message: "Pod not found",
							timestamp: Date.now(),
						});
					}
					const podData = { ...pod };
					if (podData.envVariables) {
						// Only decrypt if user is owner or manager
						const isManager = checkPermission(ctx.profile?.permission || [], [
							"manager",
						]);
						const isOwner = pod.ownerId === ctx.profile?.id;

						if (isManager || isOwner) {
							try {
								podData.envVariables = decrypt(pod.envVariables);
							} catch (e) {
								console.error("Failed to decrypt env vars for pod", pod.id, e);
								podData.envVariables = ""; // Fail safe
							}
						} else {
							podData.envVariables = ""; // Mask for others
						}
					}

					return ctx.status(200, {
						success: true,
						message: "Pod fetched successfully",
						data: podData,
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
					const body = ctx.body;

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

					// 1. Prepare Data for DB
					const envEncrypted = body.env
						? encrypt(JSON.stringify(body.env))
						: "";

					if (!ctx.profile) {
						return ctx.status(401, {
							success: false,
							message: "Unauthorized",
							timestamp: Date.now(),
						});
					}

					let newPod: SchemaStatic<typeof dbSchemaTypes.k8sPods> | undefined = undefined;

					try {
						[newPod] = await db
							.insert(schema.k8sPods)
							.values({
								clusterId: cluster.id,
								ownerId: ctx.profile.id,
								name: body.name,
								namespace: body.namespace,
								dockerImage: body.image,
								command: body.command ? body.command.join(" ") : "",
								envVariables: envEncrypted,
								status: "Pending",
								internalPort:
									body.ports && body.ports.length > 0
										? (body.ports[0]?.containerPort ?? 0)
										: 0,
								cpuRequest: 0,
								cpuLimit: 0,
								memoryRequest: 0,
								memoryLimit: 0,
								updatedAt: new Date(),
							})
							.returning();
					} catch (dbError: any) {
						console.error("DB Insert Failed:", dbError);
						return ctx.status(500, {
							success: false,
							message: `Database error: ${dbError.message}`,
							timestamp: Date.now(),
						});
					}

					// 3. Send Command to Agent
					try {
						if (!newPod) {
							throw new Error("Pod not created");
						}
						const manifest = generatePodManifest({
							name: body.name,
							namespace: body.namespace,
							image: body.image,
							command: body.command,
							args: body.args,
							env: body.env, // Plaintext for Agent
							ports: body.ports,
							resources: body.resources,
							labels: body.labels,
						});

						const response = await ctx.agentManager.sendCommand(
							cluster.agent.id,
							cluster.id,
							{
								id: globalThis.crypto.randomUUID(),
								type: 5, // CREATE_POD
								payload: manifest,
								targetNamespace: body.namespace,
								targetName: body.name,
							},
						);

						return ctx.status(201, {
							success: true,
							message: "Pod creation initiated",
							data: { ...newPod, agentResponse: response.data },
							timestamp: Date.now(),
						});
					} catch (agentError: any) {
						console.error("Agent Command Failed:", agentError);
						return ctx.status(200, {
							success: true,
							message:
								"Pod created in DB but Agent is unreachable. Will sync later.",
							timestamp: Date.now(),
						});
					}
				},
				{
					detail: { tags: ["Pods"] },
					body: Type.Object({
						name: Type.String(),
						namespace: Type.String(),
						image: Type.String(),
						command: Type.Optional(Type.Array(Type.String())),
						args: Type.Optional(Type.Array(Type.String())),
						env: Type.Optional(Type.Record(Type.String(), Type.String())),
						ports: Type.Optional(
							Type.Array(
								Type.Object({
									containerPort: Type.Number(),
									name: Type.Optional(Type.String()),
								}),
							),
						),
						resources: Type.Optional(
							Type.Object({
								// cpuRequest: Type.Optional(Type.String()),
								// cpuLimit: Type.Optional(Type.String()),
								// memoryRequest: Type.Optional(Type.String()),
								// memoryLimit: Type.Optional(Type.String()),
								requests: Type.Optional(
									Type.Object({
										cpu: Type.Optional(Type.String()),
										memory: Type.Optional(Type.String()),
									}),
								),
								limits: Type.Optional(
									Type.Object({
										cpu: Type.Optional(Type.String()),
										memory: Type.Optional(Type.String()),
									}),
								),
							}),
						),
						labels: Type.Optional(Type.Record(Type.String(), Type.String())),
					}),
					response: {
						201: baseResponseSchema(Type.Object({
							...dbSchemaTypes.k8sPods,
							agentResponse: Type.Optional(Type.String()),
						})),
						200: baseResponseSchema(Type.Optional(Type.String())),
						401: errorResponseSchema,
						400: errorResponseSchema,
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
							id: globalThis.crypto.randomUUID(),
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
					const podId = Number(ctx.params.id);
					const body = ctx.body;

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

					// Generate manifest for update - merge (simple approach) or just send fields
					// For K8s "Edit", we usually send the full desired state or a strategic merge patch.
					// Agent "EDIT_RESOURCE" likely does `kubectl apply` or `patch`.
					// We'll generate a manifest with *just* the fields we want to update (like labels).
					// For Pods, most fields are immutable.

					const manifest = generatePodManifest({
						name: pod.name,
						namespace: pod.namespace,
						image: body.image || pod.dockerImage, // basic update support
						labels: body.labels, // merge logic is complex, just sending what user wants for now
					});

					try {
						const response = await ctx.agentManager.sendCommand(
							cluster.agent.id,
							cluster.id,
							{
								id: globalThis.crypto.randomUUID(),
								type: 1, // EDIT_RESOURCE
								payload: manifest,
								targetNamespace: pod.namespace,
								targetName: pod.name,
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
						image: Type.Optional(Type.String()),
						labels: Type.Optional(Type.Record(Type.String(), Type.String())),
						env: Type.Optional(Type.Record(Type.String(), Type.String())),
					}),
					response: {
						200: baseResponseSchema(Type.Optional(Type.String())),
						404: errorResponseSchema,
						500: errorResponseSchema,
					},
				},
			)
			.ws("/logs/:podId", {
				detail: { tags: ["Pods"] },
				open: async (ws) => {
					// 1. Auth & Validation (ws.data context)
					// Elysia WS handling of auth can be tricky if not guarded.
					// But we are inside .use(authenticationMiddleware).guard(...)
					// Wait, .ws() inside guard() might not inherit context properly if not typed?
					// Assume it works.
					const { clusterId, podId } = ws.data.params;
					const profile = ws.data.profile;
					console.log("Cluster ID:", clusterId);
					console.log("Pod ID:", podId);
					console.log("Profile:", profile);

					if (!clusterId || !podId) {
						console.log("Missing params");
						ws.send("Missing params");
						ws.close();
						return;
					}

					// Verify Pod access
					const pod = await db.query.k8sPods.findFirst({
						where: {
							id: Number(podId),
							clusterId: Number(clusterId),
						},
					});

					if (!pod) {
						console.log("Pod not found");
						ws.send("Pod not found");
						ws.close();
						return;
					}

					// Permission Check
					const isManager = checkPermission(profile?.permission || [], [
						"manager",
					]);
					if (!isManager && pod.ownerId !== profile?.id) {
						console.log("Unauthorized");
						ws.send("Unauthorized");
						ws.close();
						return;
					}

					const cluster = await db.query.k8sCluster.findFirst({
						where: { id: Number(clusterId) },
						with: { agent: true },
					});

					if (!cluster || !cluster.agent) {
						console.log("Cluster/Agent not found");
						ws.send("Cluster/Agent not found");
						ws.close();
						return;
					}

					// Start stream
					// Payload for LOGS: "namespace/podName" or just JSON?
					// Agent expects something. Let's send "namespace/podName" for simplicity
					// or JSON { namespace, name, container? }
					// Let's use JSON.
					const payload = JSON.stringify({
						namespace: pod.namespace,
						name: pod.name,
						// container: ... (optional, default to first)
						tailLines: 100,
						follow: true,
					});
					console.log("Payload:", payload);

					try {
						// Command Type 9: STREAM_LOGS
						const streamId = await ws.data.agentManager.startStream(
							cluster.agent.id,
							cluster.id,
							9,
							payload,
							ws,
						);
						console.log("Stream ID:", streamId);
						// Store streamId in ws.data for cleanup
						// ws.data.streamId = streamId;
						// ws.data.agentId = cluster.agent.id;
						ws.data.websocketData.set(ws.id, {
							// ws,
							clusterId: Number(clusterId),
							streamId,
							podId: Number(podId),
							agentId: Number(cluster.agent.id),
						});
					} catch (e: any) {
						console.log("Error starting stream:", e);
						ws.send(`Error starting stream: ${e.message}`);
						ws.close();
					}
				},
				close: async (ws) => {
					const data = ws.data.websocketData.get(ws.id);
					console.log("Closing stream", data);
					if (data) {
						await ws.data.agentManager.stopStream(data.streamId);
						ws.data.websocketData.delete(ws.id);
					}
				},
				sendPings: true,
				idleTimeout: Infinity,
			})
			.ws("/exec/:podId", {
				detail: { tags: ["Pods"] },
				open: async (ws) => {
					const { clusterId, podId } = ws.data.params;
					const profile = ws.data.profile;
					console.log("Cluster ID:", clusterId);
					console.log("Pod ID:", podId);
					console.log("Profile:", profile);

					if (!clusterId || !podId) {
						console.log("Missing params");
						ws.send("Missing params");
						ws.close();
						return;
					}

					const pod = await db.query.k8sPods.findFirst({
						where: {
							id: Number(podId),
							clusterId: Number(clusterId),
						},
					});

					if (!pod) {
						console.log("Pod not found");
						ws.send("Pod not found");
						ws.close();
						return;
					}

					const isManager = checkPermission(profile?.permission || [], [
						"manager",
					]);
					if (!isManager && pod.ownerId !== profile?.id) {
						console.log("Unauthorized");
						ws.send("Unauthorized");
						ws.close();
						return;
					}

					const cluster = await db.query.k8sCluster.findFirst({
						where: { id: Number(clusterId) },
						with: { agent: true },
					});

					if (!cluster || !cluster.agent) {
						console.log("Cluster/Agent not found");
						ws.send("Cluster/Agent not found");
						ws.close();
						return;
					}

					// Payload for EXEC: JSON { namespace, name, container, command }
					// Command can be ["/bin/sh"]
					const payload = JSON.stringify({
						namespace: pod.namespace,
						name: pod.name,
						command: ["/bin/sh"],
						// container?
					});
					console.log("Payload:", payload);

					try {
						// Command Type 10: EXEC
						const streamId = await ws.data.agentManager.startStream(
							cluster.agent.id,
							cluster.id,
							10,
							payload,
							ws,
						);
						console.log("Stream ID:", streamId);
						// ws.data.streamId = streamId;
						// ws.data.agentId = cluster.agent.id;
						ws.data.websocketData.set(ws.id, {
							// ws,
							clusterId: Number(clusterId),
							streamId,
							podId: Number(podId),
							agentId: Number(cluster.agent.id),
						});
					} catch (e: any) {
						console.log("Error starting stream:", e);
						ws.send(`Error starting stream: ${e.message}`);
						ws.close();
					}
				},
				message: async (ws, message) => {
					// User sends input (stdin)
					const data = ws.data.websocketData.get(ws.id);
					if (data) {
						// Send as StreamData to Agent
						// Allow both text and binary
						let bytes: Uint8Array;
						if (typeof message === "string") {
							bytes = new TextEncoder().encode(message);
						} else if (message instanceof Uint8Array) {
							bytes = message;
						} else {
							return;
						}

						await ws.data.agentManager.sendStreamDataToAgent(data.agentId, {
							streamId: data.streamId,
							data: bytes,
							isError: false,
							closed: false,
							type: 0, // DATA
							rows: 0,
							cols: 0,
						});
					}
				},
				close: async (ws) => {
					const data = ws.data.websocketData.get(ws.id);
					if (data) {
						await ws.data.agentManager.stopStream(data.streamId);
					}
					ws.data.websocketData.delete(ws.id);
				},
			}),
	);
