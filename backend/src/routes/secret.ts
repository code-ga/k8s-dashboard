import { logger } from "../utils/logger";
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
import { generateSecretManifest } from "../utils/k8s-manifest";

export const secretRoute = new Elysia({
	prefix: "/secrets/:clusterId",
	detail: { tags: ["Secrets"] },
})
	.use(authenticationMiddleware)
	.use(agentManagerService)
	.guard({ userAuth: { requiredProfile: true } }, (app) =>
		app
			.get(
				"/",
				async (ctx) => {
					const { clusterId } = ctx.params;
					const secrets = await db.query.k8sSecrets.findMany({
						where: {
							ownerId: ctx.profile?.id ?? "",
							clusterId: Number(clusterId),
						},
					});

					// Mask data for list view
					const maskedSecrets = secrets.map((s) => ({ ...s, data: "***" }));

					return ctx.status(200, {
						success: true,
						message: "Secrets fetched successfully",
						data: maskedSecrets,
						timestamp: Date.now(),
					});
				},
				{
					detail: { tags: ["Secrets"] },
					roleAuth: "secret:read",
					response: {
						200: baseResponseSchema(
							Type.Array(Type.Object(dbSchemaTypes.k8sSecrets)),
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
					const secrets = await db.query.k8sSecrets.findMany({
						where: { clusterId: Number(clusterId) },
					});

					// Mask data for list view
					const maskedSecrets = secrets.map((s) => ({ ...s, data: "***" }));

					return ctx.status(200, {
						success: true,
						message: "Secrets fetched successfully",
						data: maskedSecrets,
						timestamp: Date.now(),
					});
				},
				{
					detail: { tags: ["Secrets"] },
					roleAuth: "secret:read",
					response: {
						200: baseResponseSchema(
							Type.Array(Type.Object(dbSchemaTypes.k8sSecrets)),
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
					const isManager =
						ctx.userPermissions.has("secret:manage") ||
						ctx.userPermissions.has("secret:read"); // Allowing manage/read
					const secret = await db.query.k8sSecrets.findFirst({
						where: isManager
							? { id: Number(id) }
							: {
									id: Number(id),
									ownerId: ctx.profile?.id ?? "",
								},
					});

					if (!secret) {
						return ctx.status(404, {
							success: false,
							message: "Secret not found",
							timestamp: Date.now(),
						});
					}

					const secretData = { ...secret };
					if (secretData.data) {
						try {
							const decrypted = decrypt(secretData.data);
							secretData.data = JSON.parse(decrypted);
						} catch (e) {
							logger.error("Failed to decrypt secret data", secret.id, e);
						}
					}

					logger.info(secretData);

					return ctx.status(200, {
						success: true,
						message: "Secret fetched successfully",
						data: secretData,
						timestamp: Date.now(),
					});
				},
				{
					detail: { tags: ["Secrets"] },
					roleAuth: "secret:read",
					response: {
						200: baseResponseSchema(
							Type.Object({
								...dbSchemaTypes.k8sSecrets,
								data: Type.Union([
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

					// For Secrets, body.data should be plain string values, we will base64 them for K8s manifest
					// and encrypt for DB.
					const binData: Record<string, string> = {};
					if (body.data) {
						for (const [key, val] of Object.entries(body.data)) {
							if (typeof val === "string") {
								binData[key] = Buffer.from(val).toString("base64");
							}
						}
					}
					const encryptedData = encrypt(JSON.stringify(binData));

					if (!ctx.profile) {
						return ctx.status(401, {
							success: false,
							message: "Unauthorized",
							timestamp: Date.now(),
						});
					}

					const [newSecret] = await db
						.insert(schema.k8sSecrets)
						.values({
							clusterId: cluster.id,
							ownerId: ctx.profile.id,
							name: body.name,
							namespace: body.namespace,
							type: body.type || "Opaque",
							data: encryptedData,
							labels: JSON.stringify(body.labels || {}),
							annotations: body.annotations || {},
							updatedAt: new Date(),
						})
						.returning();
					if (!newSecret) {
						return ctx.status(500, {
							success: false,
							message: "Failed to create secret",
							timestamp: Date.now(),
						});
					}

					try {
						const response = await ctx.agentManager.sendCommand(
							cluster.agent.id,
							cluster.id,
							{
								id: globalThis.crypto.randomUUID(),
								type: Command_CommandType.CREATE_SECRET, // CREATE_RESOURCE
								payload: generateSecretManifest({
									name: body.name,
									namespace: body.namespace,
									type: body.type || "Opaque",
									data: binData,
									labels: body.labels,
									annotations: body.annotations,
								}),
								targetNamespace: body.namespace,
								targetName: body.name,
							},
						);
						return ctx.status(201, {
							success: true,
							message: "Secret creation initiated",
							data: { ...newSecret, agentResponse: response.data },
							timestamp: Date.now(),
						});
					} catch (_agentError) {
						return ctx.status(201, {
							success: true,
							message: "Secret created in DB but agent unreachable",
							data: newSecret,
							timestamp: Date.now(),
						});
					}
				},
				{
					detail: { tags: ["Secrets"] },
					roleAuth: "secret:create",
					body: Type.Object({
						name: Type.String({ minLength: 1 }),
						namespace: Type.String({ minLength: 1 }),
						type: Type.Optional(Type.String({ minLength: 1 })),
						data: Type.Optional(Type.Record(Type.String({ minLength: 1 }), Type.String())),
						labels: Type.Optional(Type.Record(Type.String({ minLength: 1 }), Type.String())),
						annotations: Type.Optional(
							Type.Record(Type.String({ minLength: 1 }), Type.String()),
						),
					}),
					response: {
						201: baseResponseSchema(
							Type.Object({
								...dbSchemaTypes.k8sSecrets,
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

					const secret = await db.query.k8sSecrets.findFirst({
						where: {
							id: id,
							clusterId: clusterId,
						},
					});

					if (!secret) {
						return ctx.status(404, {
							success: false,
							message: "Secret not found",
							timestamp: Date.now(),
						});
					}

					// Ownership Check
					const isManager = ctx.userPermissions.has("secret:manage");
					if (!isManager && secret.ownerId !== ctx.profile?.id) {
						return ctx.status(403, {
							success: false,
							message: "Forbidden: You do not own this Secret",
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

					// For Secrets, body.data should be plain string values, we will base64 them for K8s manifest
					// and encrypt for DB.
					// We merge with existing data to support "only update edited" feature
					let binData: Record<string, string> = {};
					if (secret.data) {
						try {
							binData = JSON.parse(decrypt(secret.data));
						} catch (e) {
							logger.error(
								"Failed to decrypt existing secret data for update",
								e,
							);
						}
					}

					if (body.data) {
						for (const [key, val] of Object.entries(body.data)) {
							if (typeof val === "string") {
								binData[key] = Buffer.from(val).toString("base64");
							} else if (val === null) {
								delete binData[key];
							}
						}
					}
					const encryptedData = encrypt(JSON.stringify(binData));

					// Merge labels
					let existingLabels: Record<string, string> = {};
					if (secret.labels) {
						try {
							existingLabels = JSON.parse(secret.labels);
						} catch (e) {
							logger.error("Failed to parse existing secret labels", e);
						}
					}

					const labelData = { ...existingLabels };
					if (body.labels) {
						for (const [key, val] of Object.entries(body.labels)) {
							if (typeof val === "string") {
								labelData[key] = val;
							} else if (val === null) {
								delete labelData[key];
							}
						}
					}

					// Merge annotations
					const annotationData = {
						...((secret.annotations as Record<string, string>) || {}),
					};
					if (body.annotations) {
						for (const [key, val] of Object.entries(body.annotations)) {
							if (typeof val === "string") {
								annotationData[key] = val;
							} else if (val === null) {
								delete annotationData[key];
							}
						}
					}

					const [updatedSecret] = await db
						.update(schema.k8sSecrets)
						.set({
							type: body.type || secret.type || "Opaque",
							data: encryptedData,
							labels: JSON.stringify(labelData),
							updatedAt: new Date(),
							annotations: annotationData as Record<string, string>,
						})
						.where(eq(schema.k8sSecrets.id, id))
						.returning();
					if (!updatedSecret) {
						return ctx.status(500, {
							success: false,
							message: "Failed to update secret",
							timestamp: Date.now(),
						});
					}

					try {
						const response = await ctx.agentManager.sendCommand(
							cluster.agent.id,
							cluster.id,
							{
								id: globalThis.crypto.randomUUID(),
								type: Command_CommandType.CREATE_SECRET, // Will replace existing
								payload: generateSecretManifest({
									name: secret.name,
									namespace: secret.namespace,
									type: body.type || secret.type || "Opaque",
									data: binData, // Already combined with existing
									annotations: annotationData,
									labels: labelData,
								}),
								targetNamespace: secret.namespace,
								targetName: secret.name,
							},
						);

						return ctx.status(200, {
							success: true,
							message: "Secret updated successfully",
							data: { ...updatedSecret, agentResponse: response.data },
							timestamp: Date.now(),
						});
					} catch (_agentError) {
						return ctx.status(200, {
							success: true,
							message: "Secret updated in DB but agent unreachable",
							data: updatedSecret,
							timestamp: Date.now(),
						});
					}
				},
				{
					detail: { tags: ["Secrets"] },
					roleAuth: "secret:update",
					body: Type.Object({
						type: Type.Optional(Type.String({ minLength: 1 })),
						data: Type.Optional(
							Type.Record(
								Type.String({ minLength: 1 }),
								Type.Union([Type.String(), Type.Null()]),
							),
						),
						labels: Type.Optional(
							Type.Record(
								Type.String({ minLength: 1 }),
								Type.Union([Type.String(), Type.Null()]),
							),
						),
						annotations: Type.Optional(
							Type.Record(
								Type.String({ minLength: 1 }),
								Type.Union([Type.String(), Type.Null()]),
							),
						),
					}),
					response: {
						200: baseResponseSchema(
							Type.Object({
								...dbSchemaTypes.k8sSecrets,
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

					const secret = await db.query.k8sSecrets.findFirst({
						where: {
							id: id,
							clusterId: clusterId,
						},
					});

					if (!secret) {
						return ctx.status(404, {
							success: false,
							message: "Secret not found",
							timestamp: Date.now(),
						});
					}

					// Ownership Check
					const isManager = ctx.userPermissions.has("secret:manage");
					if (!isManager && secret.ownerId !== ctx.profile?.id) {
						return ctx.status(403, {
							success: false,
							message: "Forbidden: You do not own this Secret",
							timestamp: Date.now(),
						});
					}

					if (!secret.k8sUid) {
						await db
							.delete(schema.k8sSecrets)
							.where(eq(schema.k8sSecrets.id, id));
						return ctx.status(200, {
							success: true,
							timestamp: Date.now(),
							message: "Secret deleted successfully",
							data: null,
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
							payload: "Secret",
							targetNamespace: secret.namespace,
							targetName: secret.name,
						});

						await db
							.delete(schema.k8sSecrets)
							.where(eq(schema.k8sSecrets.id, id));

						return ctx.status(200, {
							success: true,
							message: "Secret deleted successfully",
							data: null,
							timestamp: Date.now(),
						});
					} catch (e) {
						logger.error("Failed to delete secret:", e);
						const message = e instanceof Error ? e.message : String(e);
						return ctx.status(500, {
							success: false,
							message: `Failed to delete secret: ${message}`,
							timestamp: Date.now(),
						});
					}
				},
				{
					detail: { tags: ["Secrets"] },
					roleAuth: "secret:delete",
					response: {
						200: baseResponseSchema(Type.Null()),
						403: errorResponseSchema,
						404: errorResponseSchema,
						500: errorResponseSchema,
					},
				},
			),
	);
