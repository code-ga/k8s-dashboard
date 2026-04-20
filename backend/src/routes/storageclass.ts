import { Type } from "@sinclair/typebox";
import { Elysia } from "elysia";
import { eq, type InferInsertModel } from "drizzle-orm";
import { Command_CommandType } from "../../pb-generated/agent-backend/websocket";
import { db } from "../database";
import { schema } from "../database/schema";
import { dbSchemaTypes, type SchemaStatic } from "../database/type";
import { authenticationMiddleware } from "../middleware/auth";
import { agentManagerService } from "../services/agentManager";
import { baseResponseSchema, errorResponseSchema } from "../types";
import { generateStorageClassManifest } from "../utils/k8s-manifest";
import { logger } from "../utils/logger";

export const storageclassRoute = new Elysia({
	prefix: "/storageclasses/:clusterId",
	detail: { tags: ["StorageClasses"] },
})
	.use(authenticationMiddleware)
	.use(agentManagerService)
	.guard({ userAuth: { requiredProfile: true } }, (app) =>
		app
			.get(
				"/all",
				async (ctx) => {
					const { clusterId } = ctx.params;
					const storageClasses = await db.query.k8sStorageClasses.findMany({
						where: { clusterId: Number(clusterId) },
					});
					return ctx.status(200, {
						success: true,
						message: "StorageClasses fetched successfully",
						data: storageClasses,
						timestamp: Date.now(),
					});
				},
				{
					roleAuth: "storageclass:manage",
					response: {
						200: baseResponseSchema(
							Type.Array(Type.Object(dbSchemaTypes.k8sStorageClasses)),
						),
						404: errorResponseSchema,
					},
				},
			)
			.get(
				"/",
				async (ctx) => {
					const { clusterId } = ctx.params;
					const storageClasses = await db.query.k8sStorageClasses.findMany({
						where: { clusterId: Number(clusterId) },
					});
					return ctx.status(200, {
						success: true,
						message: "StorageClasses fetched successfully",
						data: storageClasses,
						timestamp: Date.now(),
					});
				},
				{
					roleAuth: "storageclass:read",
					response: {
						200: baseResponseSchema(
							Type.Array(Type.Object(dbSchemaTypes.k8sStorageClasses)),
						),
						404: errorResponseSchema,
					},
				},
			)
			.get(
				"/:id",
				async (ctx) => {
					const { clusterId, id } = ctx.params;

					const storageClass = await db.query.k8sStorageClasses.findFirst({
						where: {
							id: Number(id),
							clusterId: Number(clusterId),
						},
					});

					if (!storageClass) {
						return ctx.status(404, {
							success: false,
							message: "StorageClass not found",
							timestamp: Date.now(),
						});
					}

					const isManager = ctx.userPermissions.has("storageclass:manage");
					if (!isManager && storageClass.ownerId !== ctx.profile?.id) {
						return ctx.status(403, {
							success: false,
							message: "Forbidden",
							timestamp: Date.now(),
						});
					}

					return ctx.status(200, {
						success: true,
						message: "StorageClass fetched successfully",
						data: storageClass,
						timestamp: Date.now(),
					});
				},
				{
					roleAuth: "storageclass:read",
					response: {
						200: baseResponseSchema(
							Type.Object(dbSchemaTypes.k8sStorageClasses),
						),
						403: errorResponseSchema,
						404: errorResponseSchema,
					},
				},
			)
			.get(
				"/:id/describe",
				async (ctx) => {
					const { clusterId, id } = ctx.params;

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

					const storageClass = await db.query.k8sStorageClasses.findFirst({
						where: {
							id: Number(id),
							clusterId: Number(clusterId),
						},
					});

					if (!storageClass) {
						return ctx.status(404, {
							success: false,
							message: "StorageClass not found",
							timestamp: Date.now(),
						});
					}

					const isManager = ctx.userPermissions.has("storageclass:manage");
					if (!isManager && storageClass.ownerId !== ctx.profile?.id) {
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
								targetNamespace: "",
								targetName: storageClass.name,
								payload: JSON.stringify({ kind: "StorageClass" }),
							},
						);

						const describe = JSON.parse(response.data || "{}");
						return ctx.status(200, {
							success: true,
							message: "Describe fetched",
							data: describe,
							timestamp: Date.now(),
						});
					} catch (error: unknown) {
						const errorMessage =
							error instanceof Error ? error.message : String(error);
						return ctx.status(500, {
							success: false,
							message: errorMessage || "Failed to fetch describe",
							timestamp: Date.now(),
						});
					}
				},
				{
					roleAuth: "storageclass:read",
					response: {
						200: baseResponseSchema(Type.Any()),
						403: errorResponseSchema,
						404: errorResponseSchema,
						500: errorResponseSchema,
					},
				},
			)
			.post(
				"/",
				async (ctx) => {
					const { clusterId } = ctx.params;
					const body = ctx.body;

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

					const existingSc = await db.query.k8sStorageClasses.findFirst({
						where: {
							clusterId: cluster.id,
							name: body.name,
						},
					});
					if (existingSc) {
						return ctx.status(409, {
							success: false,
							message: "StorageClass with the same name already exists",
							timestamp: Date.now(),
						});
					}

					const createData: InferInsertModel<typeof schema.k8sStorageClasses> =
						{
							clusterId: cluster.id,
							ownerId: ctx.profile?.id || "",
							name: body.name,
							provisioner: body.provisioner,
							reclaimPolicy: body.reclaimPolicy || "Delete",
							volumeBindingMode: body.volumeBindingMode || "Immediate",
							allowVolumeExpansion: body.allowVolumeExpansion || false,
							annotations: body.annotations || {},
							labels: body.labels || {},
							isDefault: body.isDefault || false,
							autoCreated: false,
						};

					let newSc:
						| SchemaStatic<typeof dbSchemaTypes.k8sStorageClasses>
						| undefined;

					try {
						[newSc] = await db
							.insert(schema.k8sStorageClasses)
							.values(createData)
							.returning();
						if (!newSc) {
							return ctx.status(500, {
								success: false,
								message: "Failed to create StorageClass",
								timestamp: Date.now(),
							});
						}
					} catch (dbError) {
						logger.error("DB Insert StorageClass Failed:", dbError);
						const message =
							dbError instanceof Error ? dbError.message : String(dbError);
						return ctx.status(500, {
							success: false,
							message: `Database error: ${message}`,
							timestamp: Date.now(),
						});
					}

					const manifest = generateStorageClassManifest({
						name: body.name,
						provisioner: body.provisioner,
						reclaimPolicy: body.reclaimPolicy,
						volumeBindingMode: body.volumeBindingMode,
						allowVolumeExpansion: body.allowVolumeExpansion,
						annotations: body.annotations,
						labels: body.labels,
					});

					try {
						await ctx.agentManager.sendCommand(cluster.agent.id, cluster.id, {
							id: crypto.randomUUID(),
							type: Command_CommandType.CREATE_STORAGE_CLASS,
							targetNamespace: "",
							targetName: body.name,
							payload: manifest,
						});

						return ctx.status(201, {
							success: true,
							message: "StorageClass creation initiated",
							data: { name: body.name },
							timestamp: Date.now(),
						});
					} catch (error: any) {
						logger.error(
							"Failed to send StorageClass create command to agent",
							{
								error: error.message,
								scName: body.name,
								agentId: cluster.agent?.id,
							},
						);

						return ctx.status(200, {
							success: true,
							message:
								"StorageClass created in DB but Agent is unreachable. Will sync later.",
							timestamp: Date.now(),
						});
					}
				},
				{
					roleAuth: "storageclass:create",
					body: Type.Object({
						name: Type.String({ minLength: 1 }),
						provisioner: Type.String({ minLength: 1 }),
						reclaimPolicy: Type.Optional(
							Type.Union([Type.Literal("Delete"), Type.Literal("Retain")]),
						),
						volumeBindingMode: Type.Optional(
							Type.Union([
								Type.Literal("Immediate"),
								Type.Literal("WaitForFirstConsumer"),
							]),
						),
						allowVolumeExpansion: Type.Optional(Type.Boolean()),
						annotations: Type.Optional(
							Type.Object(Type.String(), Type.String()),
						),
						labels: Type.Optional(Type.Object(Type.String(), Type.String())),
						isDefault: Type.Optional(Type.Boolean()),
					}),
					response: {
						201: baseResponseSchema(Type.Object({ name: Type.String() })),
						200: baseResponseSchema(Type.Optional(Type.String())),
						403: errorResponseSchema,
						404: errorResponseSchema,
						409: errorResponseSchema,
						500: errorResponseSchema,
					},
				},
			)
			.delete(
				"/:id",
				async (ctx) => {
					const { clusterId, id } = ctx.params;

					const storageClass = await db.query.k8sStorageClasses.findFirst({
						where: {
							id: Number(id),
							clusterId: Number(clusterId),
						},
					});

					if (!storageClass) {
						return ctx.status(404, {
							success: false,
							message: "StorageClass not found",
							timestamp: Date.now(),
						});
					}

					const isManager = ctx.userPermissions.has("storageclass:manage");
					if (!isManager && storageClass.ownerId !== ctx.profile?.id) {
						return ctx.status(403, {
							success: false,
							message: "Forbidden",
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

					if (!storageClass.k8sUid) {
						await db
							.delete(schema.k8sStorageClasses)
							.where(eq(schema.k8sStorageClasses.id, storageClass.id));
						return ctx.status(200, {
							success: true,
							message: "StorageClass deleted successfully",
							timestamp: Date.now(),
						});
					}

					try {
						await ctx.agentManager.sendCommand(cluster.agent.id, cluster.id, {
							id: crypto.randomUUID(),
							type: Command_CommandType.DELETE_STORAGE_CLASS,
							targetNamespace: "",
							targetName: storageClass.name,
							payload: "StorageClass",
						});

						return ctx.status(200, {
							success: true,
							message: "StorageClass deletion initiated",
							timestamp: Date.now(),
						});
					} catch (error: any) {
						return ctx.status(500, {
							success: false,
							message: error.message || "Failed to send delete command",
							timestamp: Date.now(),
						});
					}
				},
				{
					roleAuth: "storageclass:delete",
					response: {
						200: baseResponseSchema(Type.Optional(Type.String())),
						403: errorResponseSchema,
						404: errorResponseSchema,
						500: errorResponseSchema,
					},
				},
			)
			.patch(
				"/:id/set-default",
				async (ctx) => {
					const { clusterId, id } = ctx.params;
					const body = ctx.body;
					const isDefault = body.isDefault ?? true;

					const storageClass = await db.query.k8sStorageClasses.findFirst({
						where: {
							id: Number(id),
							clusterId: Number(clusterId),
						},
					});

					if (!storageClass) {
						return ctx.status(404, {
							success: false,
							message: "StorageClass not found",
							timestamp: Date.now(),
						});
					}

					const isManager = ctx.userPermissions.has("storageclass:manage");
					if (!isManager && storageClass.ownerId !== ctx.profile?.id) {
						return ctx.status(403, {
							success: false,
							message: "Forbidden",
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

					try {
						await ctx.agentManager.sendCommand(cluster.agent.id, cluster.id, {
							id: crypto.randomUUID(),
							type: Command_CommandType.SET_DEFAULT_STORAGE_CLASS,
							targetNamespace: "",
							targetName: storageClass.name,
							payload: isDefault ? "true" : "false",
						});

						return ctx.status(200, {
							success: true,
							message: "StorageClass default status updated",
							timestamp: Date.now(),
						});
					} catch (error: any) {
						return ctx.status(500, {
							success: false,
							message: error.message || "Failed to send update command",
							timestamp: Date.now(),
						});
					}
				},
				{
					roleAuth: "storageclass:manage",
					body: Type.Object({
						isDefault: Type.Boolean(),
					}),
					response: {
						200: baseResponseSchema(Type.Optional(Type.String())),
						403: errorResponseSchema,
						404: errorResponseSchema,
						500: errorResponseSchema,
					},
				},
			),
	);
