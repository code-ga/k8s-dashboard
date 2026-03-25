import { Type } from "@sinclair/typebox";
import { eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { Command_CommandType } from "../../pb-generated/agent-backend/websocket";
import { db } from "../database";
import { schema } from "../database/schema";
import { dbSchemaTypes } from "../database/type";
import { authenticationMiddleware } from "../middleware/auth";
import { agentManagerService } from "../services/agentManager";
import { baseResponseSchema, errorResponseSchema } from "../types";
import { decrypt, encrypt } from "../utils/crypto";
import { generateConfigMapManifest } from "../utils/k8s-manifest";
import { logger } from "../utils/logger";

export const configmapRoute = new Elysia({
	prefix: "/configmaps/:clusterId",
	detail: { tags: ["ConfigMaps"] },
})
	.use(authenticationMiddleware)
	.use(agentManagerService)
	.guard({ userAuth: { requiredProfile: true } }, (app) =>
		app
			.get(
				"/",
				async (ctx) => {
					const { clusterId } = ctx.params;
					const items = await db.query.k8sConfigMaps.findMany({
						where: {
							ownerId: ctx.profile?.id ?? "",
							clusterId: Number(clusterId),
						},
					});
					return ctx.status(200, {
						success: true,
						message: "ConfigMaps fetched successfully",
						data: items,
						timestamp: Date.now(),
					});
				},
				{
					detail: { tags: ["ConfigMaps"] },
					roleAuth: "configmap:read",
					response: {
						200: baseResponseSchema(
							Type.Array(
								Type.Object({
									...dbSchemaTypes.k8sConfigMaps,
								}),
							),
						),
						401: errorResponseSchema,
						404: errorResponseSchema,
					},
				},
			)
			.get(
				"/all",
				async (ctx) => {
					const { clusterId } = ctx.params;
					const items = await db.query.k8sConfigMaps.findMany({
						where: { clusterId: Number(clusterId) },
					});
					return ctx.status(200, {
						success: true,
						message: "ConfigMaps fetched successfully",
						data: items,
						timestamp: Date.now(),
					});
				},
				{
					detail: { tags: ["ConfigMaps"] },
					roleAuth: "configmap:read",
					response: {
						200: baseResponseSchema(
							Type.Array(
								Type.Object({
									...dbSchemaTypes.k8sConfigMaps,
								}),
							),
						),
						401: errorResponseSchema,
						404: errorResponseSchema,
					},
				},
			)
			.get(
				"/:id",
				async (ctx) => {
					const { id } = ctx.params;
					const isManager = ctx.userPermissions.has("configmap:read");
					const cm = await db.query.k8sConfigMaps.findFirst({
						where: isManager
							? { id: Number(id) }
							: {
									id: Number(id),
									ownerId: ctx.profile?.id ?? "",
								},
					});

					if (!cm) {
						return ctx.status(404, {
							success: false,
							message: "ConfigMap not found",
							timestamp: Date.now(),
						});
					}

					const cmData = { ...cm };
					if (cmData.data) {
						try {
							const decrypted = decrypt(cmData.data);
							cmData.data = JSON.parse(decrypted);
						} catch (e) {
							logger.error("Failed to decrypt configmap data", cm.id, e);
						}
					}
					if (cmData.binaryData) {
						try {
							const decrypted = decrypt(cmData.binaryData);
							cmData.binaryData = JSON.parse(decrypted);
						} catch (e) {
							logger.error("Failed to decrypt configmap binaryData", cm.id, e);
						}
					}

					logger.info(cmData);

					return ctx.status(200, {
						success: true,
						message: "ConfigMap fetched successfully",
						data: cmData,
						timestamp: Date.now(),
					});
				},
				{
					detail: { tags: ["ConfigMaps"] },
					roleAuth: "configmap:read",
					response: {
						200: baseResponseSchema(
							Type.Object({
								...dbSchemaTypes.k8sConfigMaps,
								data: Type.Union([
									Type.Record(Type.String(), Type.String()),
									Type.String(),
									Type.Null(),
									Type.Undefined(),
								]),
								binaryData: Type.Union([
									Type.Record(Type.String(), Type.String()),
									Type.String(),
									Type.Null(),
									Type.Undefined(),
								]),
							}),
						),
						401: errorResponseSchema,
						404: errorResponseSchema,
					},
				},
			)
			.post(
				"/",
				async (ctx) => {
					const clusterId = Number(ctx.params.clusterId);
					const body = ctx.body;

					const cluster = await db.query.k8sCluster.findFirst({
						where: { id: clusterId },
						with: { agent: true },
					});

					if (!cluster || !cluster.agent) {
						return ctx.status(404, {
							success: false,
							message: "Cluster not found",
							timestamp: Date.now(),
						});
					}

					const encryptedData = body.data
						? encrypt(JSON.stringify(body.data))
						: "";
					let encryptedBinaryData = "";
					if (body.binaryData) {
						encryptedBinaryData = encrypt(JSON.stringify(body.binaryData));
					}

					if (!ctx.profile) {
						return ctx.status(401, {
							success: false,
							message: "Unauthorized",
							timestamp: Date.now(),
						});
					}

					const [newCm] = await db
						.insert(schema.k8sConfigMaps)
						.values({
							clusterId: cluster.id,
							ownerId: ctx.profile.id,
							name: body.name,
							namespace: body.namespace,
							data: encryptedData,
							binaryData: encryptedBinaryData,
							labels: JSON.stringify(body.labels || {}),
							updatedAt: new Date(),
							createdAt: new Date(),
							annotations: body.annotations || {},
						})
						.returning();
					if (!newCm) {
						return ctx.status(500, {
							success: false,
							message: "Failed to create ConfigMap",
							timestamp: Date.now(),
						});
					}

					try {
						const response = await ctx.agentManager.sendCommand(
							cluster.agent.id,
							cluster.id,
							{
								id: globalThis.crypto.randomUUID(),
								type: Command_CommandType.CREATE_CONFIGMAP,
								payload: generateConfigMapManifest({
									name: body.name,
									namespace: body.namespace,
									data: body.data,
									binaryData: body.binaryData,
									labels: body.labels,
									annotations: body.annotations,
								}),
								targetNamespace: body.namespace,
								targetName: body.name,
							},
						);

						return ctx.status(201, {
							success: true,
							message: "ConfigMap creation initiated",
							data: { ...newCm, agentResponse: response.data },
							timestamp: Date.now(),
						});
					} catch (_agentError) {
						return ctx.status(201, {
							success: true,
							message: "ConfigMap created in DB but agent unreachable",
							data: newCm,
							timestamp: Date.now(),
						});
					}
				},
				{
					detail: { tags: ["ConfigMaps"] },
					roleAuth: "configmap:create",
					body: Type.Object({
						name: Type.String(),
						namespace: Type.String(),
						data: Type.Optional(Type.Record(Type.String(), Type.String())),
						binaryData: Type.Optional(
							Type.Record(Type.String(), Type.String()),
						), // Base64 encoded in requests
						labels: Type.Optional(Type.Record(Type.String(), Type.String())),
						annotations: Type.Optional(
							Type.Record(Type.String(), Type.String()),
						),
					}),
					response: {
						201: baseResponseSchema(
							Type.Object({
								...dbSchemaTypes.k8sConfigMaps,
								agentResponse: Type.Optional(Type.String()),
							}),
						),
						401: errorResponseSchema,
						404: errorResponseSchema,
						500: errorResponseSchema,
					},
				},
			)
			.put(
				"/:id",
				async (ctx) => {
					const id = Number(ctx.params.id);
					const clusterId = Number(ctx.params.clusterId);
					const body = ctx.body;

					const cm = await db.query.k8sConfigMaps.findFirst({
						where: {
							id: id,
							clusterId: clusterId,
						},
					});

					if (!cm) {
						return ctx.status(404, {
							success: false,
							message: "ConfigMap not found",
							timestamp: Date.now(),
						});
					}

					// Ownership Check
					const isManager = ctx.userPermissions.has("configmap:manage");
					if (!isManager && cm.ownerId !== ctx.profile?.id) {
						return ctx.status(403, {
							success: false,
							message: "Forbidden: You do not own this ConfigMap",
							timestamp: Date.now(),
						});
					}

					const cluster = await db.query.k8sCluster.findFirst({
						where: { id: clusterId },
						with: { agent: true },
					});

					if (!cluster || !cluster.agent) {
						return ctx.status(404, {
							success: false,
							message: "Failed to update ConfigMap",
							timestamp: Date.now(),
						});
					}

					// Merge data
					let existingData: Record<string, string> = {};
					if (cm.data) {
						try {
							existingData = JSON.parse(decrypt(cm.data));
						} catch {
							logger.error(
								"Failed to decrypt existing configmap data for update",
								cm.id,
							);
						}
					}
					const mergedData = { ...existingData };
					if (body.data) {
						for (const [key, val] of Object.entries(body.data)) {
							if (val === null) {
								delete mergedData[key];
							} else if (typeof val === "string") {
								mergedData[key] = val;
							}
						}
					}
					const encryptedData = encrypt(JSON.stringify(mergedData));

					// Merge binaryData
					let existingBinaryData: Record<string, string> = {};
					if (cm.binaryData) {
						try {
							existingBinaryData = JSON.parse(decrypt(cm.binaryData));
						} catch {
							logger.error(
								"Failed to decrypt existing configmap binaryData for update",
								cm.id,
							);
						}
					}
					const mergedBinaryData = { ...existingBinaryData };
					if (body.binaryData) {
						for (const [key, val] of Object.entries(body.binaryData)) {
							if (val === null) {
								delete mergedBinaryData[key];
							} else if (typeof val === "string") {
								mergedBinaryData[key] = val;
							}
						}
					}
					const encryptedBinaryData = encrypt(JSON.stringify(mergedBinaryData));

					// Merge labels
					let existingLabels: Record<string, string> = {};
					if (cm.labels) {
						try {
							existingLabels = JSON.parse(cm.labels);
						} catch {
							logger.error("Failed to parse existing configmap labels", cm.id);
						}
					}
					const mergedLabels = { ...existingLabels };
					if (body.labels) {
						for (const [key, val] of Object.entries(body.labels)) {
							if (val === null) {
								delete mergedLabels[key];
							} else if (typeof val === "string") {
								mergedLabels[key] = val;
							}
						}
					}

					// Merge annotations
					const mergedAnnotations = {
						...((cm.annotations as Record<string, string>) || {}),
					};
					if (body.annotations) {
						for (const [key, val] of Object.entries(body.annotations)) {
							if (val === null) {
								delete mergedAnnotations[key];
							} else if (typeof val === "string") {
								mergedAnnotations[key] = val;
							}
						}
					}

					const [updatedCm] = await db
						.update(schema.k8sConfigMaps)
						.set({
							data: encryptedData,
							binaryData: encryptedBinaryData,
							labels: JSON.stringify(mergedLabels),
							updatedAt: new Date(),
							annotations: mergedAnnotations as Record<string, string>,
						})
						.where(eq(schema.k8sConfigMaps.id, id))
						.returning();

					if (!updatedCm) {
						return ctx.status(500, {
							success: false,
							message: "Failed to update ConfigMap in DB",
							timestamp: Date.now(),
						});
					}

					try {
						const response = await ctx.agentManager.sendCommand(
							cluster.agent.id,
							cluster.id,
							{
								id: globalThis.crypto.randomUUID(),
								type: Command_CommandType.CREATE_CONFIGMAP, // Will replace existing
								payload: generateConfigMapManifest({
									name: cm.name,
									namespace: cm.namespace,
									data: mergedData,
									binaryData: mergedBinaryData,
									labels: mergedLabels,
									annotations: mergedAnnotations,
								}),
								targetNamespace: cm.namespace,
								targetName: cm.name,
							},
						);

						return ctx.status(200, {
							success: true,
							message: "ConfigMap updated successfully",
							data: { ...updatedCm, agentResponse: response.data },
							timestamp: Date.now(),
						});
					} catch (_agentError) {
						return ctx.status(200, {
							success: true,
							message: "ConfigMap updated in DB but agent unreachable",
							data: updatedCm,
							timestamp: Date.now(),
						});
					}
				},
				{
					detail: { tags: ["ConfigMaps"] },
					roleAuth: "configmap:update",
					body: Type.Object({
						data: Type.Optional(
							Type.Record(
								Type.String(),
								Type.Union([Type.String(), Type.Null()]),
							),
						),
						binaryData: Type.Optional(
							Type.Record(
								Type.String(),
								Type.Union([Type.String(), Type.Null()]),
							),
						),
						labels: Type.Optional(
							Type.Record(
								Type.String(),
								Type.Union([Type.String(), Type.Null()]),
							),
						),
						annotations: Type.Optional(
							Type.Record(
								Type.String(),
								Type.Union([Type.String(), Type.Null()]),
							),
						),
					}),
					response: {
						200: baseResponseSchema(
							Type.Object({
								...dbSchemaTypes.k8sConfigMaps,
								agentResponse: Type.Optional(Type.String()),
							}),
						),
						403: errorResponseSchema,
						404: errorResponseSchema,
						500: errorResponseSchema,
					},
				},
			)
			.delete(
				"/:id",
				async (ctx) => {
					const id = Number(ctx.params.id);
					const clusterId = Number(ctx.params.clusterId);

					const cm = await db.query.k8sConfigMaps.findFirst({
						where: {
							id: id,
							clusterId: clusterId,
						},
					});

					if (!cm) {
						return ctx.status(404, {
							success: false,
							message: "ConfigMap not found",
							timestamp: Date.now(),
						});
					}

					// Ownership Check
					const isManager = ctx.userPermissions.has("configmap:manage");
					if (!isManager && cm.ownerId !== ctx.profile?.id) {
						return ctx.status(403, {
							success: false,
							message: "Forbidden: You do not own this ConfigMap",
							timestamp: Date.now(),
						});
					}

					const cluster = await db.query.k8sCluster.findFirst({
						where: { id: clusterId },
						with: { agent: true },
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
							type: 13, // DELETE_RESOURCE
							payload: "ConfigMap",
							targetNamespace: cm.namespace,
							targetName: cm.name,
						});

						await db
							.delete(schema.k8sConfigMaps)
							.where(eq(schema.k8sConfigMaps.id, id));

						return ctx.status(200, {
							success: true,
							message: "ConfigMap deleted successfully",
							data: cm,
							timestamp: Date.now(),
						});
					} catch (e) {
						logger.error("Failed to delete ConfigMap:", e);
						const message = e instanceof Error ? e.message : String(e);
						return ctx.status(500, {
							success: false,
							message: `Failed to delete ConfigMap: ${message}`,
							timestamp: Date.now(),
						});
					}
				},
				{
					detail: { tags: ["ConfigMaps"] },
					roleAuth: "configmap:delete",
					response: {
						200: baseResponseSchema(Type.Object(dbSchemaTypes.k8sConfigMaps)),
						403: errorResponseSchema,
						404: errorResponseSchema,
						500: errorResponseSchema,
					},
				},
			),
	);
