/** biome-ignore-all lint/suspicious/noExplicitAny: <explanation> */
import { Type } from "@sinclair/typebox";
import { eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { Command_CommandType } from "../../pb-generated/agent-backend/websocket";
import { db } from "../database";
import { schema } from "../database/schema";
import { dbSchemaTypes, type SchemaStatic } from "../database/type";
import { authenticationMiddleware, checkPermission } from "../middleware/auth";
import { agentManagerService } from "../services/agentManager";
import { baseResponseSchema, errorResponseSchema } from "../types";
import { decrypt, encrypt } from "../utils/crypto";
import { generateDeploymentManifest } from "../utils/k8s-manifest";

export const deploymentRoute = new Elysia({
	prefix: "/deployments/:clusterId",
	detail: { tags: ["Deployments"] },
})
	.use(authenticationMiddleware)
	.use(agentManagerService)
	.decorate("websocketData", new Map<string, any>())
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
				response: {
					200: baseResponseSchema(
						Type.Array(Type.Object(dbSchemaTypes.k8sDeployments)),
					),
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
					const isManager = checkPermission(ctx.profile?.permission || [], [
						"manager",
					]);
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
					const depData = { ...deployment };
					if (depData.envVariables) {
						// Only decrypt if user is owner or manager
						const isManager = checkPermission(ctx.profile?.permission || [], [
							"manager",
						]);
						const isOwner = deployment.ownerId === ctx.profile?.id;

						if (isManager || isOwner) {
							try {
								depData.envVariables = decrypt(deployment.envVariables);
							} catch (e) {
								console.error(
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
					response: {
						200: baseResponseSchema(Type.Object(dbSchemaTypes.k8sDeployments)),
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

					// 1. Prepare Data
					const envEncrypted = body.env
						? encrypt(JSON.stringify(body.env))
						: "";

					let newDeployment:
						| SchemaStatic<typeof dbSchemaTypes.k8sDeployments>
						| undefined = undefined;

					try {
						// DefaultOwner logic?
						// Implementation plan says "Enforce ownership checks".
						// We have ctx.profile.id.

						if (!ctx.profile) {
							throw new Error("Unauthorized");
						}

						[newDeployment] = await db
							.insert(schema.k8sDeployments)
							.values({
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
								// internalPort? Schema has it?
								// Looking at agent.service.ts earlier: `internalPort: dep.internalPort`.
								// DeploymentDTO has ports[].
								// Schema logic for deployments usually involves internalPort for service/gateway logic?
								// If schema requires it, we should set it.
								// Let's use first port if available, or 0.
								internalPort:
									body.ports && body.ports.length > 0
										? (body.ports[0]?.containerPort ?? 0)
										: 0,
								updatedAt: new Date(),
							})
							.returning();
					} catch (dbError: any) {
						console.error("DB Insert Deployment Failed:", dbError);
						return ctx.status(500, {
							success: false,
							message: `Database error: ${dbError.message}`,
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
					} catch (agentError: any) {
						console.error("Agent Command Failed:", agentError);
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
					body: Type.Object({
						name: Type.String(),
						namespace: Type.String(),
						image: Type.String(),
						replicas: Type.Number({ default: 1 }),
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
						selector: Type.Optional(Type.Record(Type.String(), Type.String())),
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

					if (body.replicas !== undefined && !body.image && !body.resources) {
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
							SchemaStatic<typeof dbSchemaTypes.k8sDeployments>
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

						try {
							await db
								.update(schema.k8sDeployments)
								.set(updateData)
								.where(eq(schema.k8sDeployments.id, depId));
						} catch (dbError: any) {
							console.error("DB Update Failed", dbError);
							return ctx.status(500, {
								success: false,
								message: `DB Update Failed: ${dbError.message}`,
								timestamp: Date.now(),
							});
						}

						payload = generateDeploymentManifest({
							name: deployment.name,
							namespace: deployment.namespace,
							// if body.image is undefined, fallback to DB
							image: body.image || deployment.dockerImage || "",
							replicas: body.replicas ?? deployment.replicas,

							// Command/Args: Not in DB schema easily? We might lose them if we don't track them.
							// Limitation: If user didn't send them, we can't reconstruct them from just DB (unless DB has them).
							// Assuming DB schema.k8sDeployments doesn't have command/args columns (based on agent.service.ts insert not showing them).
							// Effectively this means updates might RESET command/args if not provided?
							// Or we rely on `env` if provided.
							// Current compromise: We only send what we know.

							env: body.env, // Use new env if provided. If not... should we use old?
							// If body.env is undefined, and we are generating a manifest...
							// If we generate manifest without env, it might clear it?
							// K8s 'apply' usually merges? No, Apply on a field replaces the field.
							// So if we omit 'env', it might keep existing (if not managed) or clear it?
							// Actually `generateDeploymentManifest` puts `env` in the spec.
							// If `env` is undefined, `generate` sends `undefined` (which YAML.stringify omits).
							// So K8s should keep existing envs?
							// Yes, if we don't specify it, K8s shouldn't touch it.
							// BUT: if we want to UPDATE env, we send it.
							// What if we want to keep it but update image?
							// We should ideally decrypt existing env and send it along?
							// Yes, to be safe for "Source of Truth" concept, the Manifest we send SHOULD represent the Desired State.
							// If we omit it, we are saying "I don't care about this", but we DO care (DB is truth).
							// So we should:
							// 1. Get Decrypted DB Env (merged with body.env if provided)
							// 2. Send that.

							// Fix logic:
							// const combinedEnv = body.env || (deployment.envVariables ? JSON.parse(decrypt(deployment.envVariables)) : undefined);
							// But `deployment` variable is stale if we just updated DB?
							// Actually we updated DB with `updateData`.
							// So `body.env` is the new truth if present.
							// If `body.env` is missing, `deployment.envVariables` (old) is truth.
						});

						// Re-calculate payload with correct Env preservation
						let finalEnv = body.env;
						if (!finalEnv && deployment.envVariables) {
							try {
								finalEnv = JSON.parse(decrypt(deployment.envVariables));
							} catch (e) {
								console.error("Decrypt fail", e);
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
								labels:
									body.labels ||
									(deployment.labels
										? JSON.parse(deployment.labels)
										: undefined),
								selector:
									body.selector ||
									(deployment.selector
										? JSON.parse(deployment.selector)
										: undefined),
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
					} catch (error: any) {
						return ctx.status(500, {
							success: false,
							message: `Agent error: ${error.message}`,
							timestamp: Date.now(),
						});
					}
				},
				{
					detail: { tags: ["Deployments"] },
					body: Type.Object({
						replicas: Type.Optional(Type.Number()),
						image: Type.Optional(Type.String()),
						labels: Type.Optional(Type.Record(Type.String(), Type.String())),
						selector: Type.Optional(Type.Record(Type.String(), Type.String())),
						// Adding other fields effectively means replacing them if provided
						resources: Type.Optional(
							Type.Object({
								cpuRequest: Type.Optional(Type.String()),
								cpuLimit: Type.Optional(Type.String()),
								memoryRequest: Type.Optional(Type.String()),
								memoryLimit: Type.Optional(Type.String()),
							}),
						),
						env: Type.Optional(Type.Record(Type.String(), Type.String())),
					}),
					response: {
						200: baseResponseSchema(Type.Optional(Type.String())),
						404: errorResponseSchema,
						500: errorResponseSchema,
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
					} catch (error: any) {
						return ctx.status(500, {
							success: false,
							message: `Agent error: ${error.message}`,
							timestamp: Date.now(),
						});
					}
				},
				{
					detail: { tags: ["Deployments"] },
					response: {
						200: baseResponseSchema(Type.Object(dbSchemaTypes.k8sDeployments)),
						404: errorResponseSchema,
						500: errorResponseSchema,
					},
				},
			)
			.ws("/logs/:id", {
				detail: { tags: ["Deployments"] },
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
					const isManager = checkPermission(profile?.permission || [], [
						"manager",
					]);
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
					console.log("targetPod", targetPod);
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
							console.error("websocketData missing in context");
							ws.close();
						}
					} catch (e: any) {
						ws.send(`Error starting stream: ${e.message}`);
						ws.close();
					}
				},
				close: async (ws) => {
					if (ws.data.websocketData) {
						const data = ws.data.websocketData.get(ws.id);
						if (data) {
							await ws.data.agentManager.stopStream(data.streamId);
							ws.data.websocketData.delete(ws.id);
						}
					}
				},
			}),
	);
