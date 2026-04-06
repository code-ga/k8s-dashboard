import { Type } from "@sinclair/typebox";
import { Elysia } from "elysia";
import { Command_CommandType } from "../../pb-generated/agent-backend/websocket";
import { db } from "../database";
import { dbSchemaTypes } from "../database/type";
import { authenticationMiddleware } from "../middleware/auth";
import { agentManagerService } from "../services/agentManager";
import { baseResponseSchema, errorResponseSchema } from "../types";
import { generateStorageClassManifest } from "../utils/k8s-manifest";

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
			.post(
				"/",
				async (ctx) => {
					const { clusterId } = ctx.params;
					const body = ctx.body as any;

					const cluster = (await db.query.k8sCluster.findFirst({
						where: { id: Number(clusterId) },
						with: { agent: true },
					})) as any;

					if (!cluster || !cluster.agent) {
						return ctx.status(404, {
							success: false,
							message: "Cluster or agent not found",
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
							timestamp: Date.now(),
						});
					} catch (error: any) {
						return ctx.status(500, {
							success: false,
							message: error.message || "Failed to send create command",
							timestamp: Date.now(),
						});
					}
				},
				{
					roleAuth: "storageclass:create",
					body: Type.Object({
						name: Type.String(),
						provisioner: Type.String(),
						reclaimPolicy: Type.Optional(Type.String()),
						volumeBindingMode: Type.Optional(Type.String()),
						allowVolumeExpansion: Type.Optional(Type.Boolean()),
						annotations: Type.Optional(
							Type.Object(Type.String(), Type.String()),
						),
						labels: Type.Optional(Type.Object(Type.String(), Type.String())),
					}),
					response: {
						201: baseResponseSchema(Type.Optional(Type.String())),
						404: errorResponseSchema,
						500: errorResponseSchema,
					},
				},
			)
			.delete(
				"/:name",
				async (ctx) => {
					const { clusterId, name } = ctx.params;

					const storageClass = (await db.query.k8sStorageClasses.findFirst({
						where: {
							clusterId: Number(clusterId),
							name: name as string,
						},
					})) as any;

					if (!storageClass) {
						return ctx.status(404, {
							success: false,
							message: "StorageClass not found",
							timestamp: Date.now(),
						});
					}

					const cluster = (await db.query.k8sCluster.findFirst({
						where: { id: Number(clusterId) },
						with: { agent: true },
					})) as any;

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
							type: Command_CommandType.DELETE_STORAGE_CLASS,
							targetNamespace: "",
							targetName: name as string,
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
				"/:name/set-default",
				async (ctx) => {
					const { clusterId, name } = ctx.params;
					const body = ctx.body as any;
					const isDefault = body.isDefault ?? true;

					const storageClass = (await db.query.k8sStorageClasses.findFirst({
						where: {
							clusterId: Number(clusterId),
							name: name as string,
						},
					})) as any;

					if (!storageClass) {
						return ctx.status(404, {
							success: false,
							message: "StorageClass not found",
							timestamp: Date.now(),
						});
					}

					const cluster = (await db.query.k8sCluster.findFirst({
						where: { id: Number(clusterId) },
						with: { agent: true },
					})) as any;

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
							targetName: name as string,
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
