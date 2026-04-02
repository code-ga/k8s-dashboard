import { Type } from "@sinclair/typebox";
import { Elysia } from "elysia";
import { Command_CommandType } from "../../pb-generated/agent-backend/websocket";
import { db } from "../database";
import { dbSchemaTypes } from "../database/type";
import { authenticationMiddleware } from "../middleware/auth";
import { agentManagerService } from "../services/agentManager";
import { baseResponseSchema, errorResponseSchema } from "../types";
import { generatePVCManifest } from "../utils/k8s-manifest";

export const pvcRoute = new Elysia({
	prefix: "/pvcs/:clusterId",
	detail: { tags: ["PVCs"] },
})
	.use(authenticationMiddleware)
	.use(agentManagerService)
	.guard({ userAuth: { requiredProfile: true } }, (app) =>
		app
			.get(
				"/all",
				async (ctx) => {
					const { clusterId } = ctx.params;
					const pvcs = await db.query.k8sPersistentVolumeClaims.findMany({
						where: { clusterId: Number(clusterId) },
					} as any);
					return ctx.status(200, {
						success: true,
						message: "PVCs fetched successfully",
						data: pvcs,
						timestamp: Date.now(),
					});
				},
				{
					roleAuth: "pvc:manage",
					response: {
						200: baseResponseSchema(
							Type.Array(Type.Object(dbSchemaTypes.k8sPersistentVolumeClaims)),
						),
						404: errorResponseSchema,
					},
				},
			)
			.get(
				"/",
				async (ctx) => {
					const { clusterId } = ctx.params;
					const pvcs = await db.query.k8sPersistentVolumeClaims.findMany({
						where: {
							clusterId: Number(clusterId),
							ownerId: ctx.profile?.id ?? "",
						},
					} as any);
					return ctx.status(200, {
						success: true,
						message: "PVCs fetched successfully",
						data: pvcs,
						timestamp: Date.now(),
					});
				},
				{
					roleAuth: "pvc:read",
					response: {
						200: baseResponseSchema(
							Type.Array(Type.Object(dbSchemaTypes.k8sPersistentVolumeClaims)),
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

					const manifest = generatePVCManifest({
						name: body.name,
						namespace: body.namespace,
						storageClass: body.storageClass,
						capacity: `${body.capacity}Mi`,
						accessModes: body.accessModes,
					});

					try {
						await ctx.agentManager.sendCommand(cluster.agent.id, cluster.id, {
							id: crypto.randomUUID(),
							type: Command_CommandType.CREATE_PVC,
							targetNamespace: body.namespace,
							targetName: body.name,
							payload: manifest,
						});

						return ctx.status(201, {
							success: true,
							message: "PVC creation initiated",
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
					roleAuth: "pvc:create",
					body: Type.Object({
						name: Type.String(),
						namespace: Type.String(),
						storageClass: Type.Optional(Type.String()),
						capacity: Type.Number(), // In MiB
						accessModes: Type.Optional(Type.Array(Type.String())),
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
					const { clusterId, id } = ctx.params;
					const body = ctx.body as any;

					const pvc = (await db.query.k8sPersistentVolumeClaims.findFirst({
						where: {
							id: Number(id),
							clusterId: Number(clusterId),
						},
					})) as any;

					if (!pvc) {
						return ctx.status(404, {
							success: false,
							message: "PVC not found",
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

					// Generate manifest for resizing
					const manifest = generatePVCManifest({
						name: pvc.name,
						namespace: pvc.namespace,
						storageClass: pvc.storageClass || undefined,
						capacity: `${body.capacity}Mi`,
						accessModes: undefined,
					});

					try {
						await ctx.agentManager.sendCommand(cluster.agent.id, cluster.id, {
							id: crypto.randomUUID(),
							type: Command_CommandType.RESIZE_PVC,
							targetNamespace: pvc.namespace,
							targetName: pvc.name,
							payload: manifest,
						});

						return ctx.status(200, {
							success: true,
							message: "PVC resizing initiated",
							timestamp: Date.now(),
						});
					} catch (error: any) {
						return ctx.status(500, {
							success: false,
							message: error.message || "Failed to send resize command",
							timestamp: Date.now(),
						});
					}
				},
				{
					roleAuth: "pvc:update",
					body: Type.Object({
						capacity: Type.Number(),
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
					const { clusterId, id } = ctx.params;
					const pvc = (await db.query.k8sPersistentVolumeClaims.findFirst({
						where: {
							id: Number(id),
							clusterId: Number(clusterId),
						},
					})) as any;

					if (!pvc) {
						return ctx.status(404, {
							success: false,
							message: "PVC not found",
							timestamp: Date.now(),
						});
					}

					// RBAC
					const isManager = ctx.userPermissions.has("pvc:manage");
					if (!isManager && pvc.ownerId !== ctx.profile?.id) {
						return ctx.status(403, {
							success: false,
							message: "Forbidden",
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
							type: Command_CommandType.DELETE_PVC,
							targetNamespace: pvc.namespace,
							targetName: pvc.name,
							payload: "PersistentVolumeClaim",
						});

						return ctx.status(200, {
							success: true,
							message: "PVC deletion initiated",
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
					roleAuth: "pvc:delete",
					response: {
						200: baseResponseSchema(Type.Optional(Type.String())),
						403: errorResponseSchema,
						404: errorResponseSchema,
						500: errorResponseSchema,
					},
				},
			),
	);
