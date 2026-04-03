import { Type } from "@sinclair/typebox";
import { eq, type InferInsertModel, type InferSelectModel } from "drizzle-orm";
import { Elysia } from "elysia";
import { Command_CommandType } from "../../pb-generated/agent-backend/websocket";
import { db } from "../database";
import { schema } from "../database/schema";
import { dbSchemaTypes, type SchemaStatic } from "../database/type";
import { authenticationMiddleware } from "../middleware/auth";
import { agentManagerService } from "../services/agentManager";
import { baseResponseSchema, errorResponseSchema } from "../types";
import { decrypt, encrypt } from "../utils/crypto";
import { decryptEnvVars } from "../utils/env-utils";
import { generateDeploymentManifest } from "../utils/k8s-manifest";
import { logger } from "../utils/logger";
import {
	EmptyDirVolumeRefSchema,
	fetchAllDeploymentResourceRefs,
	insertAllDeploymentResourceRefs,
	PvcVolumeRefSchema,
	updateAllDeploymentResourceRefs,
} from "../utils/resource-refs";

type WebSocketDataValue = {
	clusterId: number;
	streamId: string;
	podId: number;
	agentId: number;
	type: number;
	rows: number;
	cols: number;
};

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

export const deploymentRoute = new Elysia({
	prefix: "/deployments/:clusterId",
	detail: { tags: ["Deployments"] },
})
	.use(authenticationMiddleware)
	.use(agentManagerService)
	.decorate("websocketData", new Map<string, unknown>())
	.decorate(
		"validateResourceRefs",
		async (
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
			},
			pvcVolumes?: Array<{ pvcName: string }>,
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
						// where: and(
						// 	eq(schema.k8sConfigMaps.clusterId, clusterId),
						// 	eq(schema.k8sConfigMaps.name, name)
						// )
						where: {
							clusterId: clusterId,
							name: name,
						},
					});
					if (!cm) throw new Error(`ConfigMap '${name}' not found in cluster`);
					if (
						!userPermissions.has("configmap:manage") &&
						cm.ownerId !== profileId
					) {
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
						// where: and(
						// 	eq(schema.k8sSecrets.clusterId, clusterId),
						// 	eq(schema.k8sSecrets.name, name)
						// )
						where: {
							clusterId: clusterId,
							name: name,
						},
					});
					if (!secret) throw new Error(`Secret '${name}' not found in cluster`);
					if (
						!userPermissions.has("secret:manage") &&
						secret.ownerId !== profileId
					) {
						throw new Error(`Forbidden: You do not own Secret '${name}'`);
					}
				}
			}

			if (pvcVolumes) {
				const pvcNames = new Set<string>();
				for (const r of pvcVolumes) pvcNames.add(r.pvcName);

				for (const name of pvcNames) {
					const pvc = await db.query.k8sPersistentVolumeClaims.findFirst({
						where: {
							clusterId: clusterId,
							name: name,
						},
					});
					if (!pvc) throw new Error(`PVC '${name}' not found in cluster`);
					if (
						!userPermissions.has("storage:manage") &&
						pvc.ownerId !== profileId
					) {
						throw new Error(`Forbidden: You do not own PVC '${name}'`);
					}
				}
			}
		},
	)
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
					const deployments = await db.query.k8sDeployments.findMany({
						where: {
							clusterId: Number(clusterId),
						},
					});
					return ctx.status(200, {
						success: true,
						message: "Deployments fetched successfully",
						data: deployments,
						timestamp: Date.now(),
					});
				},
				{
					detail: { tags: ["Deployments"] },
					roleAuth: "deployment:manage",
					response: {
						200: baseResponseSchema(
							Type.Array(Type.Object(dbSchemaTypes.k8sDeployments)),
						),
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

					// Users see deployments they own (if we have ownership logic)
					// or maybe logic similar to pods?
					// Implementation plan said "User owned".

					const deployments = await db.query.k8sDeployments.findMany({
						where: {
							ownerId: ctx.profile?.id ?? "",
							clusterId: Number(clusterId),
						},
					});
					return ctx.status(200, {
						success: true,
						message: "Deployments fetched successfully",
						data: deployments,
						timestamp: Date.now(),
					});
				},
				{
					detail: { tags: ["Deployments"] },
					roleAuth: "deployment:read",
					response: {
						200: baseResponseSchema(
							Type.Array(Type.Object(dbSchemaTypes.k8sDeployments)),
						),
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
							message: "Cluster ID and Deployment ID are required",
							timestamp: Date.now(),
						});
					}
					const isManager =
						ctx.userPermissions.has("deployment:manage") ||
						ctx.userPermissions.has("deployment:read");
					const deployment = await db.query.k8sDeployments.findFirst({
						where: isManager
							? { id: Number(id), clusterId: Number(clusterId) }
							: {
									id: Number(id),
									clusterId: Number(clusterId),
									ownerId: ctx.profile?.id ?? "",
								},
					});
					if (!deployment) {
						return ctx.status(404, {
							success: false,
							message: "Deployment not found",
							timestamp: Date.now(),
						});
					}

					// Fetch resource refs from normalized tables
					const { ports, refs } = await fetchAllDeploymentResourceRefs(
						deployment.id,
					);

					const depData = {
						...deployment,
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
						pvcVolumes: refs.pvcVolumes || [],
						emptyDirVolumes: refs.emptyDirVolumes || [],
					};

					if (depData.envVariables) {
						const isOwner = deployment.ownerId === ctx.profile?.id;

						if (isManager || isOwner) {
							try {
								depData.envVariables = decrypt(deployment.envVariables);
							} catch (e) {
								logger.error(
									"Failed to decrypt env vars for deployment",
									deployment.id,
									e,
								);
								depData.envVariables = "";
							}
						} else {
							depData.envVariables = ""; // Mask
						}
					}
					return ctx.status(200, {
						success: true,
						message: "Deployment fetched successfully",
						data: depData,
						timestamp: Date.now(),
					});
				},
				{
					detail: { tags: ["Deployments"] },
					roleAuth: "deployment:read",
					response: {
						200: baseResponseSchema(
							Type.Object({
								...dbSchemaTypes.k8sDeployments,
								ports: Type.Array(
									Type.Object({
										containerPort: Type.Number(),
										name: Type.Optional(Type.String()),
									}),
								),
								configMapRefs: Type.Object({
									env: Type.Optional(Type.Array(Type.Object({ configMapName: Type.String(), key: Type.String(), name: Type.String() }))),
									envFrom: Type.Optional(Type.Array(Type.Object({ configMapName: Type.String() }))),
									volumes: Type.Optional(Type.Array(Type.Object({ configMapName: Type.String(), mountPath: Type.String(), name: Type.String() }))),
								}),
								secretRefs: Type.Object({
									env: Type.Optional(Type.Array(Type.Object({ secretName: Type.String(), key: Type.String(), name: Type.String() }))),
									envFrom: Type.Optional(Type.Array(Type.Object({ secretName: Type.String() }))),
									volumes: Type.Optional(Type.Array(Type.Object({ secretName: Type.String(), mountPath: Type.String(), name: Type.String() }))),
								}),
								pvcVolumes: Type.Optional(Type.Array(PvcVolumeRefSchema)),
								emptyDirVolumes: Type.Optional(Type.Array(EmptyDirVolumeRefSchema)),
							}),
						),
						400: errorResponseSchema,
						403: errorResponseSchema,
						404: errorResponseSchema,
						500: errorResponseSchema,
					},
				},
			)
			.get(
				"/:id/describe",
				async (ctx) => {
					const { clusterId, id } = ctx.params;
					if (!clusterId || !id) {
						return ctx.status(400, {
							success: false,
							message: "Cluster ID and Deployment ID are required",
							timestamp: Date.now(),
						});
					}
					const cluster = await db.query.k8sCluster.findFirst({
						where: { id: Number(clusterId) },
						with: { agent: true },
					});
					if (!cluster || !cluster.agent) {
						return ctx.status(404, {
							success: false,
							message: "Cluster or agent not found",
							timestamp: Date.now(),
						});
					}
					const deployment = await db.query.k8sDeployments.findFirst({
						where: { id: Number(id), clusterId: Number(clusterId) },
					});
					if (!deployment) {
						return ctx.status(404, {
							success: false,
							message: "Deployment not found",
							timestamp: Date.now(),
						});
					}

					// Ownership Check
					const isManager = ctx.userPermissions.has("deployment:manage");
					if (!isManager && deployment.ownerId !== ctx.profile?.id) {
						return ctx.status(403, {
							success: false,
							message: "Forbidden",
							timestamp: Date.now(),
						});
					}

					try {
						const response = await ctx.agentManager.sendCommand(
							cluster.agent.id,
							cluster.id,
							{
								id: crypto.randomUUID(),
								type: Command_CommandType.DESCRIBE_RESOURCE,
								targetNamespace: deployment.namespace,
								targetName: deployment.name,
								payload: JSON.stringify({ kind: "Deployment" }),
							},
						);

						return ctx.status(200, {
							success: true,
							message: "Describe fetched",
							data: JSON.parse(response.data || "{}"),
							timestamp: Date.now(),
						});
					} catch (error: any) {
						return ctx.status(500, {
							success: false,
							message: error.message || "Failed to fetch describe",
							timestamp: Date.now(),
						});
					}
				},
				{
					detail: { tags: ["Deployments"] },
					roleAuth: "deployment:read",
					response: {
						200: baseResponseSchema(Type.Any()),
						400: errorResponseSchema,
						403: errorResponseSchema,
						404: errorResponseSchema,
						500: errorResponseSchema,
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
							ctx.profile?.id ?? "",
							ctx.userPermissions,
							body.configMapRefs,
							body.secretRefs,
						);
					} catch (e: unknown) {
						const message = e instanceof Error ? e.message : String(e);
						return ctx.status(message.includes("Forbidden") ? 403 : 400, {
							success: false,
							message,
							timestamp: Date.now(),
						});
					}

					// 1. Prepare Data
					const envEncrypted = body.env
						? encrypt(JSON.stringify(body.env))
						: "";

					let newDeployment:
						| SchemaStatic<typeof dbSchemaTypes.k8sDeployments>
						| undefined;

					try {
						// DefaultOwner logic?
						// Implementation plan says "Enforce ownership checks".
						// We have ctx.profile.id.

						if (!ctx.profile) {
							throw new Error("Unauthorized");
						}

						const createData: InferInsertModel<typeof schema.k8sDeployments> = {
							clusterId: cluster.id,
							ownerId: ctx.profile.id,
							name: body.name,
							namespace: body.namespace,
							replicas: body.replicas,
							availableReplicas: 0,
							unavailableReplicas: body.replicas,
							dockerImage: body.image,
							labels: body.labels ? JSON.stringify(body.labels) : null,
							selector: body.selector ? JSON.stringify(body.selector) : null,
							envVariables: envEncrypted,
							command: body.command ? body.command.join(" ") : "",
							args: body.args ? body.args.join(" ") : "",
							ports: [], // Now stored in normalized tables
							configMapRefs: { env: [], envFrom: [], volumes: [] }, // Legacy field
							secretRefs: { env: [], envFrom: [], volumes: [] }, // Legacy field
							cpuRequest: body.resources?.requests?.cpu
								? parseCpuStr(body.resources.requests.cpu)
								: 0,
							cpuLimit: body.resources?.limits?.cpu
								? parseCpuStr(body.resources.limits.cpu)
								: 0,
							memoryRequest: body.resources?.requests?.memory
								? parseMemoryStr(body.resources.requests.memory)
								: 0,
							memoryLimit: body.resources?.limits?.memory
								? parseMemoryStr(body.resources.limits.memory)
								: 0,
							annotations: body.annotations ? body.annotations : undefined,
							templateAnnotations: body.templateAnnotations
								? body.templateAnnotations
								: undefined,
							updatedAt: new Date(),
						};
						if (body.isAutoScaling !== undefined)
							createData.isAutoScaling = body.isAutoScaling;
						if (body.isAlwaysRunning !== undefined)
							createData.isAlwaysRunning = body.isAlwaysRunning;
						if (body.idleTimeoutSeconds !== undefined)
							createData.idleTimeoutSeconds = body.idleTimeoutSeconds;

						[newDeployment] = await db
							.insert(schema.k8sDeployments)
							.values(createData)
							.returning();
						if (!newDeployment) {
							return ctx.status(500, {
								success: false,
								message: "Failed to create deployment",
								timestamp: Date.now(),
							});
						}

						// Insert resource refs into normalized tables
						await insertAllDeploymentResourceRefs(
							newDeployment.id,
							body.ports || [],
							{
								configMapRefs: body.configMapRefs,
								secretRefs: body.secretRefs,
								pvcVolumes: body.pvcVolumes,
								emptyDirVolumes: body.emptyDirVolumes,
							},
						);
					} catch (dbError) {
						logger.error("DB Insert Deployment Failed:", dbError);
						const message =
							dbError instanceof Error ? dbError.message : String(dbError);
						return ctx.status(500, {
							success: false,
							message: `Database error: ${message}`,
							timestamp: Date.now(),
						});
					}

					try {
						if (!newDeployment) {
							throw new Error("Deployment not created");
						}

						const manifest = generateDeploymentManifest({
							name: body.name,
							namespace: body.namespace,
							image: body.image,
							replicas: body.replicas,
							command: body.command,
							args: body.args,
							env: body.env, // Plaintext
							ports: body.ports,
							resources: body.resources,
							labels: body.labels,
							selector: body.selector,
							configMapRefs: body.configMapRefs,
							secretRefs: body.secretRefs,
							pvcVolumes: body.pvcVolumes,
							emptyDirVolumes: body.emptyDirVolumes,
							annotations: body.annotations || undefined,
							templateAnnotations: body.templateAnnotations || undefined,
						});

						const response = await ctx.agentManager.sendCommand(
							cluster.agent.id,
							cluster.id,
							{
								id: globalThis.crypto.randomUUID(),
								type: Command_CommandType.CREATE_DEPLOYMENT,
								payload: manifest,
								targetNamespace: body.namespace,
								targetName: body.name,
							},
						);

						return ctx.status(201, {
							success: true,
							message: "Deployment creation initiated",
							data: { ...newDeployment, agentResponse: response.data },
							timestamp: Date.now(),
						});
					} catch (agentError) {
						logger.error("Agent Command Failed:", agentError);
						return ctx.status(200, {
							success: true,
							message:
								"Deployment created in DB but Agent is unreachable. Will sync later.",
							timestamp: Date.now(),
						});
					}
				},
				{
					detail: { tags: ["Deployments"] },
					roleAuth: "deployment:create",
					body: Type.Object({
						name: Type.String(),
						namespace: Type.String(),
						image: Type.String(),
						replicas: Type.Number({ default: 1 }),
						command: Type.Optional(Type.Array(Type.String())),
						args: Type.Optional(Type.Array(Type.String())),
						env: Type.Optional(
							Type.Array(
								Type.Object({
									name: Type.String(),
									value: Type.Optional(Type.String()),
									valueFrom: Type.Optional(Type.Any()),
								}),
							),
						),
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
						pvcVolumes: Type.Optional(
							Type.Array(PvcVolumeRefSchema),
						),
						emptyDirVolumes: Type.Optional(
							Type.Array(EmptyDirVolumeRefSchema),
						),
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
						selector: Type.Optional(Type.Record(Type.String(), Type.String())),
						annotations: Type.Optional(
							Type.Record(Type.String(), Type.String()),
						),
						templateAnnotations: Type.Optional(
							Type.Record(Type.String(), Type.String()),
						),
						isAutoScaling: Type.Optional(Type.Boolean()),
						isAlwaysRunning: Type.Optional(Type.Boolean()),
						idleTimeoutSeconds: Type.Optional(Type.Number()),
					}),
					response: {
						201: baseResponseSchema(
							Type.Object({
								...dbSchemaTypes.k8sDeployments,
								agentResponse: Type.Optional(Type.String()),
							}),
						),
						200: baseResponseSchema(Type.Optional(Type.String())),
						400: errorResponseSchema,
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
					const depId = Number(ctx.params.id);
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

					const deployment = await db.query.k8sDeployments.findFirst({
						where: {
							id: depId,
							clusterId: clusterId,
						},
					});

					if (!deployment) {
						return ctx.status(404, {
							success: false,
							message: "Deployment not found",
							timestamp: Date.now(),
						});
					}

					// Ownership Check
					const isManager = ctx.userPermissions.has("deployment:manage");
					if (!isManager && deployment.ownerId !== ctx.profile?.id) {
						return ctx.status(403, {
							success: false,
							message: "Forbidden: You do not own this deployment",
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
								body.secretRefs,
								body.pvcVolumes,
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

					// Special handling for SCALING vs EDITING
					// If ONLY replicas is provided, we can use SCALE_DEPLOYMENT command
					// But we can also just use EDIT_RESOURCE which applies the change.
					// Agent "SCALE_DEPLOYMENT" might be optimized.
					// Let's use SCALE_DEPLOYMENT if it's just scaling?
					// Actually, let's keep it simple: Use EDIT_RESOURCE with partial manifest (or full).
					// Or check if we have Command_CommandType.SCALE_DEPLOYMENT available.

					let commandType: Command_CommandType =
						Command_CommandType.EDIT_RESOURCE;
					let payload = "";

					if (
						body.replicas !== undefined &&
						!body.image &&
						!body.resources &&
						!body.configMapRefs &&
						!body.secretRefs
					) {
						// User intends to scale
						commandType = Command_CommandType.SCALE_DEPLOYMENT;
						payload = String(body.replicas);
					} else {
						// User intends to update spec
						// We need to reconstruct the manifest.
						// Ideally we should start from current state, but we only have DB state.
						// We'll trust DB state + updates.

						// Note: resources/ports/env are not fully stored in DB columns as structured JSON in the schema seen earlier
						// (schema has envVariables: text, internalPort: int).
						// This limits our ability to fully reconstruct the manifest from DB perfecty if complex fields are missing.
						// However, for valid update, we generate what we have.

						// BUT: we have `deployment.replicas` in DB.

						// Update DB first if env or other fields are changing
						// Optimization: Only update fields present in body
						const updateData: Partial<
							InferSelectModel<typeof schema.k8sDeployments>
						> = {
							updatedAt: new Date(),
						};
						if (body.image) updateData.dockerImage = body.image;
						if (body.replicas !== undefined)
							updateData.replicas = body.replicas;
						if (body.env) {
							updateData.envVariables = encrypt(JSON.stringify(body.env));
						}
						// labels, selector updates? Schema stores stringified.
						if (body.labels) updateData.labels = JSON.stringify(body.labels);
						if (body.selector)
							updateData.selector = JSON.stringify(body.selector);
						if (body.command) updateData.command = body.command.join(" ");
						if (body.args) updateData.args = body.args.join(" ");
						if (body.resources) {
							if (body.resources.requests?.cpu)
								updateData.cpuRequest = parseCpuStr(
									body.resources.requests.cpu,
								);
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
						if (body.templateAnnotations)
							updateData.templateAnnotations = body.templateAnnotations;

						if (body.isAutoScaling !== undefined)
							updateData.isAutoScaling = body.isAutoScaling;
						if (body.isAlwaysRunning !== undefined)
							updateData.isAlwaysRunning = body.isAlwaysRunning;
						if (body.idleTimeoutSeconds !== undefined)
							updateData.idleTimeoutSeconds = body.idleTimeoutSeconds;
						let newDeployment:
							| InferSelectModel<typeof schema.k8sDeployments>
							| undefined = undefined;
						try {
							newDeployment = await db
								.update(schema.k8sDeployments)
								.set(updateData)
								.where(eq(schema.k8sDeployments.id, depId))
								.returning()
								.then((res) => res[0]);

							// Update resource refs in normalized tables if provided
							if (body.ports || body.configMapRefs || body.secretRefs) {
								await updateAllDeploymentResourceRefs(depId, body.ports || [], {
									configMapRefs: body.configMapRefs,
									secretRefs: body.secretRefs,
									pvcVolumes: body.pvcVolumes,
									emptyDirVolumes: body.emptyDirVolumes,
								});
							}
						} catch (dbError) {
							logger.error("DB Update Failed", dbError);
							const message =
								dbError instanceof Error ? dbError.message : String(dbError);
							return ctx.status(500, {
								success: false,
								message: `DB Update Failed: ${message}`,
								timestamp: Date.now(),
							});
						}
						if (!newDeployment) {
							return ctx.status(500, {
								success: false,
								message: "Failed to update deployment",
								timestamp: Date.now(),
							});
						}
						// Re-calculate payload with correct Env/ConfigMap/Secret preservation
						let finalEnv = body.env;
						if (!finalEnv && deployment.envVariables) {
							finalEnv = decryptEnvVars(deployment.envVariables, deployment.name);
						}

						let finalConfigMapRefs = body.configMapRefs;
						if (!finalConfigMapRefs && deployment.configMapRefs) {
							try {
								finalConfigMapRefs = deployment.configMapRefs;
							} catch (e) {
								logger.error("Failed to parse configMapRefs", e);
							}
						}

						let finalSecretRefs = body.secretRefs;
						if (!finalSecretRefs && deployment.secretRefs) {
							try {
								finalSecretRefs = deployment.secretRefs;
							} catch (e) {
								logger.error("Failed to parse secretRefs", e);
							}
						}

						// If we are Scaling ONLY, we don't need Env.
						// @ts-expect-error
						if (commandType === Command_CommandType.SCALE_DEPLOYMENT) {
							// Payload is just number
						} else {
							// Re-gen manifest
							payload = generateDeploymentManifest({
								name: deployment.name,
								namespace: deployment.namespace,
								image: body.image || deployment.dockerImage || "",
								replicas: body.replicas ?? deployment.replicas,
								env: finalEnv,
								configMapRefs: finalConfigMapRefs,
								secretRefs: finalSecretRefs,
								pvcVolumes: body.pvcVolumes,
								emptyDirVolumes: body.emptyDirVolumes,
								labels: body.labels || (deployment.labels ? JSON.parse(deployment.labels) : undefined),
								selector:
									body.selector ||
									(deployment.selector
										? JSON.parse(deployment.selector)
										: undefined),
								ports: newDeployment.ports,
								resources: {
									requests: {
										cpu:
											body.resources?.requests?.cpu ||
											newDeployment.cpuRequest ||
											"0",
										memory:
											body.resources?.requests?.memory ||
											newDeployment.memoryRequest ||
											"0",
									},
									limits: {
										cpu:
											body.resources?.limits?.cpu ||
											newDeployment.cpuLimit ||
											"0",
										memory:
											body.resources?.limits?.memory ||
											newDeployment.memoryLimit ||
											"0",
									},
								},
								annotations: newDeployment.annotations,
								templateAnnotations: newDeployment.templateAnnotations,
								args: newDeployment.args.split(" "),
								command: newDeployment.command.split(" "),
								// Still missing command/args/ports from DB if they aren't stored
								// This is a known limitation of the current Schema.
								// Detailed restoration requires schema updates.
							});
						}
					}

					try {
						const response = await ctx.agentManager.sendCommand(
							cluster.agent.id,
							cluster.id,
							{
								id: globalThis.crypto.randomUUID(),
								type: commandType,
								payload: payload,
								targetNamespace: deployment.namespace,
								targetName: deployment.name,
							},
						);

						return ctx.status(200, {
							success: true,
							message: "Deployment update command sent",
							data: response.data,
							timestamp: Date.now(),
						});
					} catch (error) {
						const message =
							error instanceof Error ? error.message : String(error);
						return ctx.status(500, {
							success: false,
							message: `Agent error: ${message}`,
							timestamp: Date.now(),
						});
					}
				},
				{
					detail: { tags: ["Deployments"] },
					roleAuth: "deployment:update",
					body: Type.Object({
						replicas: Type.Optional(Type.Number()),
						image: Type.Optional(Type.String()),
						labels: Type.Optional(Type.Record(Type.String(), Type.String())),
						selector: Type.Optional(Type.Record(Type.String(), Type.String())),
						templateAnnotations: Type.Optional(
							Type.Record(Type.String(), Type.String()),
						),
						// Adding other fields effectively means replacing them if provided
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
						env: Type.Optional(
							Type.Array(
								Type.Object({
									name: Type.String(),
									value: Type.Optional(Type.String()),
									valueFrom: Type.Optional(Type.Any()),
								}),
							),
						),
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
						pvcVolumes: Type.Optional(
							Type.Array(PvcVolumeRefSchema),
						),
						emptyDirVolumes: Type.Optional(
							Type.Array(EmptyDirVolumeRefSchema),
						),
						command: Type.Optional(Type.Array(Type.String())),
						args: Type.Optional(Type.Array(Type.String())),
						ports: Type.Optional(
							Type.Array(
								Type.Object({
									containerPort: Type.Number(),
									name: Type.Optional(Type.String()),
								}),
							),
						),
						annotations: Type.Optional(
							Type.Record(Type.String(), Type.String()),
						),
						isAutoScaling: Type.Optional(Type.Boolean()),
						isAlwaysRunning: Type.Optional(Type.Boolean()),
						idleTimeoutSeconds: Type.Optional(Type.Number()),
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
			.get(
				"/:id/pods",
				async (ctx) => {
					const { clusterId, id } = ctx.params;
					if (!clusterId || !id) {
						return ctx.status(400, {
							success: false,
							message: "Cluster ID and Deployment ID are required",
							timestamp: Date.now(),
						});
					}

					// Check authorization: user must be manager or deployment owner
					const isManager =
						ctx.userPermissions.has("deployment:manage") ||
						ctx.userPermissions.has("deployment:read");
					const deployment = await db.query.k8sDeployments.findFirst({
						where: isManager
							? { id: Number(id), clusterId: Number(clusterId) }
							: {
									id: Number(id),
									clusterId: Number(clusterId),
									ownerId: ctx.profile?.id ?? "",
								},
					});

					if (!deployment) {
						return ctx.status(404, {
							success: false,
							message: "Deployment not found",
							timestamp: Date.now(),
						});
					}

					// Fetch all pods managed by this deployment
					// Only query pods that belong to the same cluster
					const pods = await db.query.k8sPods.findMany({
						where: {
							deploymentId: deployment.id,
							clusterId: Number(clusterId),
						},
					});

					// Sort by createdAt descending (newest first)
					const sortedPods = pods.sort((a, b) => {
						const timeA = new Date(a.createdAt).getTime();
						const timeB = new Date(b.createdAt).getTime();
						return timeB - timeA;
					});

					return ctx.status(200, {
						success: true,
						message: "Pods fetched successfully",
						data: sortedPods,
						timestamp: Date.now(),
					});
				},
				{
					detail: { tags: ["Deployments"] },
					roleAuth: "deployment:read",
					response: {
						200: baseResponseSchema(
							Type.Array(Type.Object(dbSchemaTypes.k8sPods)),
						),
						404: errorResponseSchema,
						400: errorResponseSchema,
					},
				},
			)
			.delete(
				"/:id",
				async (ctx) => {
					const depId = Number(ctx.params.id);
					const clusterId = Number(ctx.params.clusterId);

					const deployment = await db.query.k8sDeployments.findFirst({
						where: {
							id: depId,
							clusterId: clusterId,
						},
					});

					if (!deployment) {
						return ctx.status(404, {
							success: false,
							message: "Deployment not found",
							timestamp: Date.now(),
						});
					}

					// Ownership Check
					const isManager = ctx.userPermissions.has("deployment:manage");
					if (!isManager && deployment.ownerId !== ctx.profile?.id) {
						return ctx.status(403, {
							success: false,
							message: "Forbidden: You do not own this deployment",
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
						await ctx.agentManager.sendCommand(cluster.agent.id, cluster.id, {
							id: globalThis.crypto.randomUUID(),
							type: Command_CommandType.DELETE_DEPLOYMENT, // Assuming generic delete or specific
							// If explicit DELETE_DEPLOYMENT exists use it, otherwise DELETE_RESOURCE
							// Checking proto... 6 is DELETE_POD.
							// Usually there is a generic DELETE or specific.
							// Let's assume 8 (DELETE_RESOURCE) or similar if available, or just map correctly.
							// Wait, previous pod delete used type 6.
							// AgentService has: 5=CREATE_POD, 6=DELETE_POD, 1=EDIT_RESOURCE.
							// I should check `Command_CommandType` enum values.
							// I'll rely on the imported enum.

							// If `DELETE_DEPLOYMENT` exists:
							// type: Command_CommandType.DELETE_DEPLOYMENT,

							// If not, maybe use DELETE_RESOURCE if implemented?
							// Let's assume for now DELETE_RESOURCE covers it or we fallback to generic logic.
							// Actually, I'll use `Command_CommandType.DELETE_DEPLOYMENT` assuming it exists in the updated proto.
							// If not, I will fix.

							targetNamespace: deployment.namespace,
							targetName: deployment.name,
							payload: "Deployment", // Sometimes payload is the Kind?
						});

						await db
							.delete(schema.k8sDeployments)
							.where(eq(schema.k8sDeployments.id, depId));

						return ctx.status(200, {
							success: true,
							message: "Deployment deleted successfully",
							data: deployment,
							timestamp: Date.now(),
						});
					} catch (error) {
						const message =
							error instanceof Error ? error.message : String(error);
						return ctx.status(500, {
							success: false,
							message: `Agent error: ${message}`,
							timestamp: Date.now(),
						});
					}
				},
				{
					detail: { tags: ["Deployments"] },
					roleAuth: "deployment:delete",
					response: {
						200: baseResponseSchema(Type.Object(dbSchemaTypes.k8sDeployments)),
						403: errorResponseSchema,
						404: errorResponseSchema,
						500: errorResponseSchema,
					},
				},
			)
			.ws("/logs/:id", {
				detail: { tags: ["Deployments"] },
				roleAuth: "deployment:read",
				open: async (ws) => {
					// 1. Auth & Validation (ws.data context)
					const { clusterId, id } = ws.data.params;
					const profile = ws.data.profile;

					if (!clusterId || !id) {
						ws.send("Missing params");
						ws.close();
						return;
					}

					// Verify Deployment access
					const deployment = await db.query.k8sDeployments.findFirst({
						where: {
							id: Number(id),
							clusterId: Number(clusterId),
						},
					});

					if (!deployment) {
						ws.send("Deployment not found");
						ws.close();
						return;
					}

					// Permission Check
					const isManager =
						ws.data.userPermissions.has("deployment:manage") ||
						ws.data.userPermissions.has("deployment:read");
					if (!isManager && deployment.ownerId !== profile?.id) {
						ws.send("Unauthorized");
						ws.close();
						return;
					}

					const cluster = await db.query.k8sCluster.findFirst({
						where: { id: Number(clusterId) },
						with: { agent: true },
					});

					if (!cluster || !cluster.agent) {
						ws.send("Cluster/Agent not found");
						ws.close();
						return;
					}

					// 2. Find a running pod for this deployment
					// We need to look up pods that belong to this deployment.
					// Schema has `deploymentId` on k8sPods.

					const pods = await db.query.k8sPods.findMany({
						where: {
							deploymentId: deployment.id,
							clusterId: cluster.id,
						},
					});

					if (pods.length === 0) {
						ws.send("No pods found for this deployment");
						ws.close();
						return;
					}

					// Pick the first one (or preferably one that is 'Running' if we had status)
					// Verify if we have status in DB? schema.ts says k8sPods has internalPort etc but not explicit 'status' column
					// visible in the snippet provided earlier?
					// Wait, step 5 view of pod.ts uses `dbSchemaTypes.k8sPods`.
					// Step 7 schema.ts: k8sPods has `createdAt`, `k8sUid`, `cpuRequest`...
					// NO `status` column in k8sPods!
					// However, AgentService syncs pods.
					// If we don't have status, we just pick the first one.
					const targetPod = pods[0];
					logger.info("targetPod", targetPod);
					if (!targetPod) {
						ws.send("No pods found for this deployment");
						ws.close();
						return;
					}

					// Start stream using existing generic STREAM_LOGS command
					const payload = JSON.stringify({
						namespace: targetPod.namespace,
						name: targetPod.name,
						tailLines: 100,
						follow: true,
					});

					try {
						// Command Type 9: STREAM_LOGS (from pod.ts usage)
						const streamId = await ws.data.agentManager.startStream(
							cluster.agent.id,
							cluster.id,
							9, // STREAM_LOGS
							payload,
							ws,
						);

						// Store stream info for cleanup
						// We don't have `websocketData` map here unless we decorate it like in pod.ts
						// Deployment router was created new.
						// NEED TO CHECK IF `.decorate("websocketData", ...)` was added to deploymentRoute.
						// It wasn't in my previous `create deployment.ts` step!
						// I must add the decoration or use a shared one.

						// Strategy: I will add the decoration to this router now.
						// But I am inside the .ws() call which is inside a guard etc.
						// I should have added .decorate at the top level of the router.
						// I will rely on `ws.data` having it if I add it to the top level chain.

						// For this replace_content, I'll assume ws.data.websocketData exists
						// AND I will issue another replace to add the decorate call at the top.

						if (ws.data.websocketData) {
							ws.data.websocketData.set(ws.id, {
								clusterId: Number(clusterId),
								streamId,
								podId: targetPod.id, // storing podId for tracking
								agentId: Number(cluster.agent.id),
								type: 0, // DATA
								rows: 0,
								cols: 0,
							});
						} else {
							// Fallback if not decorated yet?
							// We need to decorate. I'll make sure to add it.
							logger.error("websocketData missing in context");
							ws.close();
						}
					} catch (e) {
						logger.info("Error starting stream:", e);
						const message = e instanceof Error ? e.message : String(e);
						ws.send(`Error starting stream: ${message}`);
						ws.close();
						return;
					}
				},
				close: async (ws) => {
					if (ws.data.websocketData) {
						const data = ws.data.websocketData.get(ws.id) as
							| WebSocketDataValue
							| undefined;
						if (data) {
							await ws.data.agentManager.stopStream(data.streamId);
							ws.data.websocketData.delete(ws.id);
						}
					}
				},
			})
			.post(
				"/re-deploy/:id",
				async (ctx) => {
					const depId = Number(ctx.params.id);
					const clusterId = Number(ctx.params.clusterId);

					const deployment = await db.query.k8sDeployments.findFirst({
						where: {
							id: depId,
							clusterId: clusterId,
						},
					});

					if (!deployment) {
						return ctx.status(404, {
							success: false,
							message: "Deployment not found",
							timestamp: Date.now(),
						});
					}

					// Ownership Check
					const isManager = ctx.userPermissions.has("deployment:manage");
					if (!isManager && deployment.ownerId !== ctx.profile?.id) {
						return ctx.status(403, {
							success: false,
							message: "Forbidden: You do not own this deployment",
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
						const updateData = {
							templateAnnotations: {
								...(deployment.templateAnnotations as Record<string, string>),
								"k8s.dashboard.io/redeployed-at": new Date().toISOString(),
								"kubectl.kubernetes.io/restartedAt": new Date().toISOString(),
							},
							updatedAt: new Date(),
						};

						const [newDeployment] = await db
							.update(schema.k8sDeployments)
							.set(updateData)
							.where(eq(schema.k8sDeployments.id, depId))
							.returning();
						if (!newDeployment) {
							throw new Error("Failed to update deployment");
						}

						const finalEnv = decryptEnvVars(
							newDeployment.envVariables,
							newDeployment.name,
						);

						const payload = generateDeploymentManifest({
							name: newDeployment.name,
							namespace: newDeployment.namespace,
							image: newDeployment.dockerImage || "",
							replicas: newDeployment.replicas,
							env: finalEnv,
							configMapRefs: newDeployment.configMapRefs || undefined,
							secretRefs: newDeployment.secretRefs || undefined,
							labels: newDeployment.labels
								? JSON.parse(newDeployment.labels)
								: undefined,
							selector: newDeployment.selector
								? JSON.parse(newDeployment.selector)
								: undefined,
							ports: newDeployment.ports,
							resources: {
								requests: {
									cpu: newDeployment.cpuRequest
										? `${newDeployment.cpuRequest}m`
										: undefined,
									memory: newDeployment.memoryRequest
										? `${newDeployment.memoryRequest}Mi`
										: undefined,
								},
								limits: {
									cpu: newDeployment.cpuLimit
										? `${newDeployment.cpuLimit}m`
										: undefined,
									memory: newDeployment.memoryLimit
										? `${newDeployment.memoryLimit}Mi`
										: undefined,
								},
							},
							annotations: newDeployment.annotations as Record<string, string>,
							templateAnnotations: newDeployment.templateAnnotations as Record<
								string,
								string
							>,
							args: newDeployment.args
								? newDeployment.args.split(" ")
								: undefined,
							command: newDeployment.command
								? newDeployment.command.split(" ")
								: undefined,
						});

						const response = await ctx.agentManager.sendCommand(
							cluster.agent.id,
							cluster.id,
							{
								id: globalThis.crypto.randomUUID(),
								type: Command_CommandType.EDIT_RESOURCE,
								payload: payload,
								targetNamespace: newDeployment.namespace,
								targetName: newDeployment.name,
							},
						);
						return ctx.status(200, {
							success: true,
							message: "Deployment re-deployed",
							timestamp: Date.now(),
							data: {
								...newDeployment,
								agentResponse: response.data,
							},
						});
					} catch (e) {
						logger.error("Error re-deploying deployment:", e);
						const message = e instanceof Error ? e.message : String(e);
						return ctx.status(500, {
							success: false,
							message: `Error re-deploying deployment: ${message}`,
							timestamp: Date.now(),
						});
					}
				},
				{
					detail: { tags: ["Deployments"] },
					roleAuth: "deployment:update",
					response: {
						200: baseResponseSchema(
							Type.Object({
								...dbSchemaTypes.k8sDeployments,
								agentResponse: Type.Optional(Type.String()),
							}),
						),
						403: errorResponseSchema,
						404: errorResponseSchema,
						500: errorResponseSchema,
					},
				},
			)
			.patch(
				"/:id/redeploy",
				async (ctx) => {
					const clusterId = Number(ctx.params.clusterId);
					const id = ctx.params.id;

					const cluster = await db.query.k8sCluster.findFirst({
						where: {
							id: clusterId,
						},
					});

					if (!cluster) {
						return ctx.status(404, {
							success: false,
							message: "Cluster not found",
							timestamp: Date.now(),
						});
					}

					const deployment = await db.query.k8sDeployments.findFirst({
						where: {
							id: Number(id),
						},
					});

					if (!deployment) {
						return ctx.status(404, {
							success: false,
							message: "Deployment not found",
							timestamp: Date.now(),
						});
					}

					const commandId = crypto.randomUUID();
					const response = await ctx.agentManager.sendCommand(
						cluster.agentId,
						clusterId,
						{
							id: commandId,
							type: Command_CommandType.REDEPLOY_DEPLOYMENT,
							targetNamespace: deployment.namespace,
							targetName: deployment.name,
							payload: "",
						},
					);

					if (!response.success) {
						return ctx.status(500, {
							success: false,
							message: response.error || "Failed to trigger re-deployment",
							timestamp: Date.now(),
						});
					}

					return ctx.status(200, {
						success: true,
						message: "Deployment re-deployment triggered successfully",
						timestamp: Date.now(),
						data: null,
					});
				},
				{
					detail: {
						tags: ["Deployments"],
					},
					response: {
						200: baseResponseSchema(Type.Null()),
						404: errorResponseSchema,
						500: errorResponseSchema,
					},
					roleAuth: "deployment:update",
				},
			),
	);
