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
import { generateConfigMapManifest } from "../utils/k8s-manifest";

export const configmapRoute = new Elysia({
	prefix: "/configmaps/:clusterId",
	detail: { tags: ["ConfigMaps"] },
})
	.use(authenticationMiddleware)
	.use(agentManagerService)
	.guard({ roleAuth: ["user"] }, (app) =>
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
					response: {
						200: baseResponseSchema(
							Type.Array(Type.Object(dbSchemaTypes.k8sConfigMaps as any)),
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
							console.error("Failed to decrypt configmap data", cm.id, e);
						}
					}
					if (cmData.binaryData) {
						try {
							const decrypted = decrypt(cmData.binaryData);
							cmData.binaryData = JSON.parse(decrypted);
						} catch (e) {
							console.error("Failed to decrypt configmap binaryData", cm.id, e);
						}
					}

					return ctx.status(200, {
						success: true,
						message: "ConfigMap fetched successfully",
						data: cmData,
						timestamp: Date.now(),
					});
				},
				{
					detail: { tags: ["ConfigMaps"] },
					response: {
						200: baseResponseSchema(Type.Object(dbSchemaTypes.k8sConfigMaps)),
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
					body: Type.Object({
						name: Type.String(),
						namespace: Type.String(),
						data: Type.Optional(Type.Record(Type.String(), Type.String())),
						binaryData: Type.Optional(
							Type.Record(Type.String(), Type.String()),
						), // Base64 encoded in requests
						labels: Type.Optional(Type.Record(Type.String(), Type.String())),
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
							data: null,
							timestamp: Date.now(),
						});
					} catch (e: any) {
						return ctx.status(500, {
							success: false,
							message: `Failed to delete ConfigMap: ${e.message}`,
							timestamp: Date.now(),
						});
					}
				},
				{
					detail: { tags: ["ConfigMaps"] },
					response: {
						200: baseResponseSchema(Type.Null()),
						404: errorResponseSchema,
						500: errorResponseSchema,
					},
				},
			),
	);
