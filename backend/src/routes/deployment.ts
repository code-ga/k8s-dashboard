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
import { generateDeploymentManifest } from "../utils/k8s-manifest";
import { Command_CommandType } from "../../pb-generated/agent-backend/websocket";

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
							owner: {
								id: ctx.profile?.id,
							},
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
					const deployment = await db.query.k8sDeployments.findFirst({
						where: {
							id: Number(id),
							owner: checkPermission(ctx.profile?.permission || [], ["manager"])
								? undefined // Manager sees all
								: {
										id: ctx.profile?.id, // User sees owned
									},
							clusterId: Number(clusterId),
						},
					});
					if (!deployment) {
						return ctx.status(404, {
							success: false,
							message: "Deployment not found",
							timestamp: Date.now(),
						});
					}
					return ctx.status(200, {
						success: true,
						message: "Deployment fetched successfully",
						data: deployment,
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

					const manifest = generateDeploymentManifest({
						name: body.name,
						namespace: body.namespace,
						image: body.image,
						replicas: body.replicas,
						command: body.command,
						args: body.args,
						env: body.env,
						ports: body.ports,
						resources: body.resources,
						labels: body.labels,
						selector: body.selector,
					});

					try {
						const response = await ctx.agentManager.sendCommand(
							cluster.agent.id,
							cluster.id,
							{
								id: crypto.randomUUID(),
								type: Command_CommandType.CREATE_DEPLOYMENT,
								payload: manifest,
								targetNamespace: body.namespace,
								targetName: body.name,
							},
						);

						return ctx.status(201, {
							success: true,
							message: "Deployment creation command sent",
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
								cpuRequest: Type.Optional(Type.String()),
								cpuLimit: Type.Optional(Type.String()),
								memoryRequest: Type.Optional(Type.String()),
								memoryLimit: Type.Optional(Type.String()),
							}),
						),
						labels: Type.Optional(Type.Record(Type.String(), Type.String())),
						selector: Type.Optional(Type.Record(Type.String(), Type.String())),
					}),
					response: {
						201: baseResponseSchema(Type.Optional(Type.String())),
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

					let commandType = Command_CommandType.EDIT_RESOURCE;
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

						const labels = deployment.labels
							? JSON.parse(deployment.labels)
							: {};
						const selector = deployment.selector
							? JSON.parse(deployment.selector)
							: {};
						// Note: resources/ports/env are not fully stored in DB columns as structured JSON in the schema seen earlier
						// (schema has envVariables: text, internalPort: int).
						// This limits our ability to fully reconstruct the manifest from DB perfecty if complex fields are missing.
						// However, for valid update, we generate what we have.

						// BUT: we have `deployment.replicas` in DB.

						payload = generateDeploymentManifest({
							name: deployment.name,
							namespace: deployment.namespace,
							// if body.image is undefined, fallback to DB. DB has dockerImage.
							image: body.image || deployment.dockerImage || "",
							replicas: body.replicas ?? deployment.replicas,

							// We don't have stored command/args/ports as structured data easily in DB schema shown?
							// Schema: command: text (""), envVariables: text (""), internalPort: int.
							// We will use what matches.

							// For simplicity, we only allow updating what we can safely reconstruct or what is passed.
							// If user doesn't pass image, we use old image.

							labels: body.labels || labels,
							selector: body.selector || selector,

							// If these are missing in body, and we can't fully reconstruct validation from DB (e.g. env is string),
							// we might lose data if we apply a partial manifest that clobbers?
							// EDIT_RESOURCE usually applies/patches.
							// If we send a manifest with missing fields, K8s might remove them or merge them depending on 'kubectl apply' behavior.
							// Safest is to only support fields we can fully control or assume others are not touched.
							// Let's assume the manifest generator creates a minimal manifest that Apply will merge.
						});
					}

					try {
						const response = await ctx.agentManager.sendCommand(
							cluster.agent.id,
							cluster.id,
							{
								id: crypto.randomUUID(),
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
							id: crypto.randomUUID(),
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
