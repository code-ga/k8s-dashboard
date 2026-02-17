import { Type } from "@sinclair/typebox";
import { eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { Command_CommandType } from "../../pb-generated/agent-backend/websocket";
import { db } from "../database";
import { schema } from "../database/schema";
import { dbSchemaTypes } from "../database/type";
import { authenticationMiddleware, checkPermission } from "../middleware/auth";
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
					const isManager = checkPermission(ctx.profile?.permission || [], [
						"manager",
					]);
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
							console.error("Failed to decrypt secret data", secret.id, e);
						}
					}

					console.log(secretData);

					return ctx.status(200, {
						success: true,
						message: "Secret fetched successfully",
						data: secretData,
						timestamp: Date.now(),
					});
				},
				{
					detail: { tags: ["Secrets"] },
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
							updatedAt: new Date(),
						})
						.returning();

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
							data: newSecret as any,
							timestamp: Date.now(),
						});
					}
				},
				{
					detail: { tags: ["Secrets"] },
					body: Type.Object({
						name: Type.String(),
						namespace: Type.String(),
						type: Type.Optional(Type.String()),
						data: Type.Optional(Type.Record(Type.String(), Type.String())),
						labels: Type.Optional(Type.Record(Type.String(), Type.String())),
					}),
					response: {
						201: baseResponseSchema(
							Type.Object({
								...(dbSchemaTypes.k8sSecrets as any),
								agentResponse: Type.Optional(Type.String()),
							}),
						),
						401: errorResponseSchema,
						404: errorResponseSchema,
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

					const [updatedSecret] = await db
						.update(schema.k8sSecrets)
						.set({
							type: body.type || secret.type || "Opaque",
							data: encryptedData,
							labels: JSON.stringify(body.labels || {}),
							updatedAt: new Date(),
						})
						.where(eq(schema.k8sSecrets.id, id))
						.returning();

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
									data: binData,
									labels: body.labels,
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
							data: updatedSecret as any,
							timestamp: Date.now(),
						});
					}
				},
				{
					detail: { tags: ["Secrets"] },
					body: Type.Object({
						type: Type.Optional(Type.String()),
						data: Type.Optional(Type.Record(Type.String(), Type.String())),
						labels: Type.Optional(Type.Record(Type.String(), Type.String())),
					}),
					response: {
						200: baseResponseSchema(
							Type.Object({
								...(dbSchemaTypes.k8sSecrets as any),
								agentResponse: Type.Optional(Type.String()),
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
					} catch (e: any) {
						return ctx.status(500, {
							success: false,
							message: `Failed to delete secret: ${e.message}`,
							timestamp: Date.now(),
						});
					}
				},
				{
					detail: { tags: ["Secrets"] },
					response: {
						200: baseResponseSchema(Type.Null()),
						404: errorResponseSchema,
						500: errorResponseSchema,
					},
				},
			),
	);
