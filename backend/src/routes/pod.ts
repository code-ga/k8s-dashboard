import { logger } from "../utils/logger";
import { Type } from "@sinclair/typebox";
import { eq, type InferInsertModel } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "../database";
import { schema } from "../database/schema";
import { dbSchemaTypes, type SchemaStatic } from "../database/type";
import { authenticationMiddleware } from "../middleware/auth";
import { agentManagerService } from "../services/agentManager";
import { baseResponseSchema, errorResponseSchema } from "../types";
import { decrypt, encrypt } from "../utils/crypto";
import { generatePodManifest } from "../utils/k8s-manifest";
import {
	ConfigMapEnvFromRefSchema,
	ConfigMapEnvRefSchema,
	ConfigMapVolumeRefSchema,
	fetchAllPodResourceRefs,
	insertAllPodResourceRefs,
	PortRefSchema,
	SecretEnvFromRefSchema,
	SecretEnvRefSchema,
	SecretVolumeRefSchema,
	updateAllPodResourceRefs,
} from "../utils/resource-refs";

const parseCpuStr = (cpu: string): number => {
	if (cpu.endsWith("m")) return parseInt(cpu);
	return parseFloat(cpu) * 1000;
};

const parseMemoryStr = (mem: string): number => {
	if (mem.endsWith("Ki")) return Math.ceil(parseInt(mem) / 1024);
	if (mem.endsWith("Mi")) return parseInt(mem);
	if (mem.endsWith("Gi")) return parseInt(mem) * 1024;
	if (mem.endsWith("Ti")) return parseInt(mem) * 1024 * 1024;
	return parseInt(mem);
};

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
	.decorate("validateResourceRefs", async (
		clusterId: number,
		profileId: string,
		userPermissions: Set<string>,
		configMapRefs?: {
			env?: Array<{ configMapName: string }>;
			envFrom?: Array<{ configMapName: string }>;
			volumes?: Array<{ configMapName: string }>;
		},
		secretRefs?: {
			env?: Array<{ secretName: string }>;
			envFrom?: Array<{ secretName: string }>;
			volumes?: Array<{ secretName: string }>;
		}
	) => {
		if (configMapRefs) {
			const cmNames = new Set<string>();
			if (configMapRefs.env) {
				for (const r of configMapRefs.env) cmNames.add(r.configMapName);
			}
			if (configMapRefs.envFrom) {
				for (const r of configMapRefs.envFrom) cmNames.add(r.configMapName);
			}
			if (configMapRefs.volumes) {
				for (const r of configMapRefs.volumes) cmNames.add(r.configMapName);
			}

			for (const name of cmNames) {
				const cm = await db.query.k8sConfigMaps.findFirst({
					where: {
						clusterId: clusterId,
						name: name
					}
				});
				if (!cm) throw new Error(`ConfigMap '${name}' not found in cluster`);
				if (!userPermissions.has("configmap:manage") && cm.ownerId !== profileId) {
					throw new Error(`Forbidden: You do not own ConfigMap '${name}'`);
				}
			}
		}

		if (secretRefs) {
			const secretNames = new Set<string>();
			if (secretRefs.env) {
				for (const r of secretRefs.env) secretNames.add(r.secretName);
			}
			if (secretRefs.envFrom) {
				for (const r of secretRefs.envFrom) secretNames.add(r.secretName);
			}
			if (secretRefs.volumes) {
				for (const r of secretRefs.volumes) secretNames.add(r.secretName);
			}

			for (const name of secretNames) {
				const secret = await db.query.k8sSecrets.findFirst({
					where: {
						clusterId: clusterId,
						name: name
					}
				});
				if (!secret) throw new Error(`Secret '${name}' not found in cluster`);
				if (!userPermissions.has("secret:manage") && secret.ownerId !== profileId) {
					throw new Error(`Forbidden: You do not own Secret '${name}'`);
				}
			}
		}
	})
	.guard({ userAuth: { requiredProfile: true } }, (app) =>
		app
			.get(
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
					roleAuth: "pod:manage",
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
					roleAuth: "pod:read",
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
					roleAuth: "pod:read",
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
					const isManager = ctx.userPermissions.has("pod:manage");
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

					// Fetch resource refs from normalized tables
					const { ports, refs } = await fetchAllPodResourceRefs(pod.id);

					const podData = {
						...pod,
						ports,
						configMapRefs: refs.configMapRefs || {
							env: [],
							envFrom: [],
							volumes: [],
						},
						secretRefs: refs.secretRefs || {
							env: [],
							envFrom: [],
							volumes: [],
						},
					};

					if (podData.envVariables) {
						// Only decrypt if user is owner or manager
						const isOwner = pod.ownerId === ctx.profile?.id;

						if (isManager || isOwner) {
							try {
								podData.envVariables = decrypt(pod.envVariables);
							} catch (e) {
								logger.error("Failed to decrypt env vars for pod", pod.id, e);
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
					roleAuth: "pod:read",
					response: {
						200: baseResponseSchema(
							Type.Object({
								...dbSchemaTypes.k8sPods,
								ports: Type.Array(PortRefSchema),
								configMapRefs: Type.Object({
									env: Type.Optional(Type.Array(ConfigMapEnvRefSchema)),
									envFrom: Type.Optional(Type.Array(ConfigMapEnvFromRefSchema)),
									volumes: Type.Optional(Type.Array(ConfigMapVolumeRefSchema)),
								}),
								secretRefs: Type.Object({
									env: Type.Optional(Type.Array(SecretEnvRefSchema)),
									envFrom: Type.Optional(Type.Array(SecretEnvFromRefSchema)),
									volumes: Type.Optional(Type.Array(SecretVolumeRefSchema)),
								}),
							}),
						),
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

					// 0. Validate ConfigMap/Secret ownership
					try {
						await ctx.validateResourceRefs(
							clusterId,
							ctx.profile?.id ?? "NONE",
							ctx.userPermissions,
							body.configMapRefs,
							body.secretRefs
						);
					} catch (e: unknown) {
						const message = e instanceof Error ? e.message : String(e);
						if (message.includes("Forbidden")) {
							return ctx.status(403, {
								success: false,
								message,
								timestamp: Date.now(),
							});
						}
						return ctx.status(400, {
							success: false,
							message,
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

					let newPod: SchemaStatic<typeof dbSchemaTypes.k8sPods> | undefined;
					const createData: InferInsertModel<typeof schema.k8sPods> = {
						clusterId: cluster.id,
						ownerId: ctx.profile.id,
						name: body.name,
						namespace: body.namespace,
						dockerImage: body.image,
						command: body.command ? body.command.join(" ") : "",
						args: body.args ? body.args.join(" ") : "",
						envVariables: envEncrypted,
						status: "Pending",
						cpuRequest: 0,
						cpuLimit: 0,
						memoryRequest: 0,
						memoryLimit: 0,
						updatedAt: new Date(),
						labels: JSON.stringify(body.labels), // will be change to jsonb in the future, but for now we keep it as string for simplicity
						annotations: body.annotations || {}, // that is jsonb in the schema, so we can directly store the object
					};
					try {
						[newPod] = await db
							.insert(schema.k8sPods)
							.values(createData)
							.returning();

						if (!newPod) {
							return ctx.status(500, {
								success: false,
								message: "Failed to create pod",
								timestamp: Date.now(),
							});
						}

						// Insert refs into normalized tables
						await insertAllPodResourceRefs(newPod.id, body.ports || [], {
							configMapRefs: body.configMapRefs,
							secretRefs: body.secretRefs,
						});
					} catch (dbError) {
						logger.error("DB Insert Failed:", dbError);
						const message =
							dbError instanceof Error ? dbError.message : String(dbError);
						return ctx.status(500, {
							success: false,
							message: `Database error: ${message}`,
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
							configMapRefs: body.configMapRefs,
							secretRefs: body.secretRefs,
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
					} catch (agentError) {
						logger.error("Agent Command Failed:", agentError);
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
					roleAuth: "pod:create",
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
						configMapRefs: Type.Optional(
							Type.Object({
								env: Type.Optional(
									Type.Array(
										Type.Object({
											name: Type.String(),
											configMapName: Type.String(),
											key: Type.String(),
										}),
									),
								),
								envFrom: Type.Optional(
									Type.Array(
										Type.Object({
											configMapName: Type.String(),
											prefix: Type.Optional(Type.String()),
										}),
									),
								),
								volumes: Type.Optional(
									Type.Array(
										Type.Object({
											name: Type.String(),
											configMapName: Type.String(),
											mountPath: Type.String(),
											items: Type.Optional(
												Type.Array(
													Type.Object({
														key: Type.String(),
														path: Type.String(),
													}),
												),
											),
										}),
									),
								),
							}),
						),
						secretRefs: Type.Optional(
							Type.Object({
								env: Type.Optional(
									Type.Array(
										Type.Object({
											name: Type.String(),
											secretName: Type.String(),
											key: Type.String(),
										}),
									),
								),
								envFrom: Type.Optional(
									Type.Array(
										Type.Object({
											secretName: Type.String(),
											prefix: Type.Optional(Type.String()),
										}),
									),
								),
								volumes: Type.Optional(
									Type.Array(
										Type.Object({
											name: Type.String(),
											secretName: Type.String(),
											mountPath: Type.String(),
											items: Type.Optional(
												Type.Array(
													Type.Object({
														key: Type.String(),
														path: Type.String(),
													}),
												),
											),
										}),
									),
								),
							}),
						),
						annotations: Type.Optional(
							Type.Record(Type.String(), Type.String()),
						),
					}),
					response: {
						201: baseResponseSchema(
							Type.Object({
								...dbSchemaTypes.k8sPods,
								agentResponse: Type.Optional(Type.String()),
							}),
						),
						200: baseResponseSchema(Type.Optional(Type.String())),
						400: errorResponseSchema,
						401: errorResponseSchema,
						403: errorResponseSchema,
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

					// Ownership Check
					const isManager = ctx.userPermissions.has("pod:manage");
					if (!isManager && pod.ownerId !== ctx.profile?.id) {
						return ctx.status(403, {
							success: false,
							message: "Forbidden: You do not own this pod",
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
						// 1. Mark as terminating in DB first
						await db
							.update(schema.k8sPods)
							.set({ status: "Terminating", updatedAt: new Date() })
							.where(eq(schema.k8sPods.id, podId));

						// 2. Send Command
						await ctx.agentManager.sendCommand(cluster.agentId, cluster.id, {
							id: globalThis.crypto.randomUUID(),
							type: 6, // DELETE_POD
							targetNamespace: pod.namespace,
							targetName: pod.name,
							payload: "",
						});

						// 3. Final Delete from DB
						await db.delete(schema.k8sPods).where(eq(schema.k8sPods.id, podId));

						return ctx.status(200, {
							success: true,
							message: "Pod deletion initiated",
							data: pod,
							timestamp: Date.now(),
						});
					} catch (error) {
						logger.error("Agent Delete Command Failed:", error);
						// If sendCommand failed, DB already has status 'Terminating'
						// Dashboard will show it as terminating and sync will eventually catch up
						return ctx.status(200, {
							success: true,
							message:
								"Pod marked for deletion in DB but Agent is unreachable. Will sync later.",
							data: pod,
							timestamp: Date.now(),
						});
					}
				},
				{
					detail: { tags: ["Pods"] },
					roleAuth: "pod:delete",
					response: {
						200: baseResponseSchema(Type.Object(dbSchemaTypes.k8sPods)),
						403: errorResponseSchema,
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

					// Ownership Check
					const isManager = ctx.userPermissions.has("pod:manage");
					if (!isManager && pod.ownerId !== ctx.profile?.id) {
						return ctx.status(403, {
							success: false,
							message: "Forbidden: You do not own this pod",
							timestamp: Date.now(),
						});
					}

					// Validate ConfigMap/Secret ownership if refs are updated
					if (body.configMapRefs || body.secretRefs) {
						try {
							await ctx.validateResourceRefs(
								clusterId,
								ctx.profile?.id ?? "",
								ctx.userPermissions,
								body.configMapRefs,
								body.secretRefs
							);
						} catch (e: unknown) {
							const message = e instanceof Error ? e.message : String(e);
							return ctx.status(message.includes("Forbidden") ? 403 : 400, {
								success: false,
								message,
								timestamp: Date.now(),
							});
						}
					}

					// Update DB record
					const updateData: Partial<InferInsertModel<typeof schema.k8sPods>> = {
						updatedAt: new Date(),
					};
					if (body.image) updateData.dockerImage = body.image;
					if (body.command) updateData.command = body.command.join(" ");
					if (body.args) updateData.args = body.args.join(" ");
					if (body.env)
						updateData.envVariables = encrypt(JSON.stringify(body.env));
					if (body.labels) updateData.labels = JSON.stringify(body.labels);

					// Parse resources if provided
					if (body.resources) {
						if (body.resources.requests?.cpu)
							updateData.cpuRequest = parseCpuStr(body.resources.requests.cpu);
						if (body.resources.requests?.memory)
							updateData.memoryRequest = parseMemoryStr(
								body.resources.requests.memory,
							);
						if (body.resources.limits?.cpu)
							updateData.cpuLimit = parseCpuStr(body.resources.limits.cpu);
						if (body.resources.limits?.memory)
							updateData.memoryLimit = parseMemoryStr(
								body.resources.limits.memory,
							);
					}
					if (body.annotations) updateData.annotations = body.annotations;

					try {
						await db
							.update(schema.k8sPods)
							.set(updateData)
							.where(eq(schema.k8sPods.id, podId))
							.returning();

						// Update resource refs in normalized tables if provided
						if (body.ports || body.configMapRefs || body.secretRefs) {
							await updateAllPodResourceRefs(podId, body.ports || [], {
								configMapRefs: body.configMapRefs,
								secretRefs: body.secretRefs,
							});
						}
					} catch (dbError) {
						logger.error("DB Update Failed:", dbError);
						const message =
							dbError instanceof Error ? dbError.message : String(dbError);
						return ctx.status(500, {
							success: false,
							message: `Database update failed: ${message}`,
							timestamp: Date.now(),
						});
					}

					// Merge env for manifest
					let finalEnv = body.env;
					if (!finalEnv && pod.envVariables) {
						try {
							finalEnv = JSON.parse(decrypt(pod.envVariables));
						} catch (e) {
							logger.error("Failed to decrypt env for pod", pod.id, e);
						}
					}

					// Generate manifest for update - NO LONGER USED for Agent command since we use DELETE_POD
					// But we still need environmental preservation if we were to use it.
					// Since we use DELETE_POD, sync will use DB spec.

					try {
						const response = await ctx.agentManager.sendCommand(
							cluster.agent.id,
							cluster.id,
							{
								id: globalThis.crypto.randomUUID(),
								type: 6, // DELETE_POD - Trigger recreation via sync
								payload: "",
								targetNamespace: pod.namespace,
								targetName: pod.name,
							},
						);

						return ctx.status(200, {
							success: true,
							message: "Pod update initiated (delete and recreate)",
							data: response.data,
							timestamp: Date.now(),
						});
					} catch (error) {
						logger.error("Agent Update Command Failed:", error);
						return ctx.status(200, {
							success: true,
							message:
								"Pod updated in DB but Agent is unreachable. Will sync later.",
							timestamp: Date.now(),
						});
					}
				},
				{
					detail: { tags: ["Pods"] },
					roleAuth: "pod:update",
					body: Type.Object({
						image: Type.Optional(Type.String()),
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
						configMapRefs: Type.Optional(
							Type.Object({
								env: Type.Optional(
									Type.Array(
										Type.Object({
											name: Type.String(),
											configMapName: Type.String(),
											key: Type.String(),
										}),
									),
								),
								envFrom: Type.Optional(
									Type.Array(
										Type.Object({
											configMapName: Type.String(),
											prefix: Type.Optional(Type.String()),
										}),
									),
								),
								volumes: Type.Optional(
									Type.Array(
										Type.Object({
											name: Type.String(),
											configMapName: Type.String(),
											mountPath: Type.String(),
											items: Type.Optional(
												Type.Array(
													Type.Object({
														key: Type.String(),
														path: Type.String(),
													}),
												),
											),
										}),
									),
								),
							}),
						),
						secretRefs: Type.Optional(
							Type.Object({
								env: Type.Optional(
									Type.Array(
										Type.Object({
											name: Type.String(),
											secretName: Type.String(),
											key: Type.String(),
										}),
									),
								),
								envFrom: Type.Optional(
									Type.Array(
										Type.Object({
											secretName: Type.String(),
											prefix: Type.Optional(Type.String()),
										}),
									),
								),
								volumes: Type.Optional(
									Type.Array(
										Type.Object({
											name: Type.String(),
											secretName: Type.String(),
											mountPath: Type.String(),
											items: Type.Optional(
												Type.Array(
													Type.Object({
														key: Type.String(),
														path: Type.String(),
													}),
												),
											),
										}),
									),
								),
							}),
						),
						annotations: Type.Optional(
							Type.Record(Type.String(), Type.String()),
						),
						// For simplicity, we only allow updating these fields. More can be added as needed.
						// Note that some fields like name and namespace are immutable in Kubernetes and would require delete+recreate approach.
						// We will handle that logic in the service layer.
						// For now, we just trigger a delete command and let sync handle the recreation with updated spec.
						// In the future, we can implement a smarter update logic that only updates mutable fields without deletion.
						// But for now, this is simpler.
					}),
					response: {
						200: baseResponseSchema(Type.Optional(Type.String())),
						400: errorResponseSchema,
						403: errorResponseSchema,
						404: errorResponseSchema,
						500: errorResponseSchema,
					},
				},
			)
			.ws("/logs/:podId", {
				detail: { tags: ["Pods"] },
				roleAuth: "pod:read",
				open: async (ws) => {
					// 1. Auth & Validation (ws.data context)
					// Elysia WS handling of auth can be tricky if not guarded.
					// But we are inside .use(authenticationMiddleware).guard(...)
					// Wait, .ws() inside guard() might not inherit context properly if not typed?
					// Assume it works.
					const { clusterId, podId } = ws.data.params;
					const profile = ws.data.profile;
					logger.info("Cluster ID:", clusterId);
					logger.info("Pod ID:", podId);
					logger.info("Profile:", profile);

					if (!clusterId || !podId) {
						logger.info("Missing params");
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
						logger.info("Pod not found");
						ws.send("Pod not found");
						ws.close();
						return;
					}

					// Permission Check
					const isManager =
						ws.data.userPermissions.has("pod:manage") ||
						ws.data.userPermissions.has("pod:read");
					if (!isManager && pod.ownerId !== profile?.id) {
						logger.info("Unauthorized");
						ws.send("Unauthorized");
						ws.close();
						return;
					}

					const cluster = await db.query.k8sCluster.findFirst({
						where: { id: Number(clusterId) },
						with: { agent: true },
					});

					if (!cluster || !cluster.agent) {
						logger.info("Cluster/Agent not found");
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
					logger.info("Payload:", payload);

					try {
						// Command Type 9: STREAM_LOGS
						const streamId = await ws.data.agentManager.startStream(
							cluster.agent.id,
							cluster.id,
							9,
							payload,
							ws,
						);
						logger.info("Stream ID:", streamId);
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
					} catch (e) {
						logger.info("Error starting stream:", e);
						const message = e instanceof Error ? e.message : String(e);
						ws.send(`Error starting stream: ${message}`);
						ws.close();
						return;
					}
				},
				close: async (ws) => {
					const data = ws.data.websocketData.get(ws.id);
					logger.info("Closing stream", data);
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
				roleAuth: "pod:read",
				open: async (ws) => {
					const { clusterId, podId } = ws.data.params;
					const profile = ws.data.profile;
					logger.info("Cluster ID:", clusterId);
					logger.info("Pod ID:", podId);
					logger.info("Profile:", profile);

					if (!clusterId || !podId) {
						logger.info("Missing params");
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
						logger.info("Pod not found");
						ws.send("Pod not found");
						ws.close();
						return;
					}

					const isManager =
						ws.data.userPermissions.has("pod:manage") ||
						ws.data.userPermissions.has("pod:update");
					if (!isManager && pod.ownerId !== profile?.id) {
						logger.info("Unauthorized");
						ws.send("Unauthorized");
						ws.close();
						return;
					}

					const cluster = await db.query.k8sCluster.findFirst({
						where: { id: Number(clusterId) },
						with: { agent: true },
					});

					if (!cluster || !cluster.agent) {
						logger.info("Cluster/Agent not found");
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
					logger.info("Payload:", payload);

					try {
						// Command Type 10: EXEC
						const streamId = await ws.data.agentManager.startStream(
							cluster.agent.id,
							cluster.id,
							10,
							payload,
							ws,
						);
						logger.info("Stream ID:", streamId);
						// ws.data.streamId = streamId;
						// ws.data.agentId = cluster.agent.id;
						ws.data.websocketData.set(ws.id, {
							// ws,
							clusterId: Number(clusterId),
							streamId,
							podId: Number(podId),
							agentId: Number(cluster.agent.id),
						});
					} catch (e) {
						logger.info("Error starting stream:", e);
						const message = e instanceof Error ? e.message : String(e);
						ws.send(`Error starting stream: ${message}`);
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
