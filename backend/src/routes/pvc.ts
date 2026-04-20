import { Type } from "@sinclair/typebox";
import { Elysia } from "elysia";
import { eq, type InferInsertModel } from "drizzle-orm";
import { Command_CommandType } from "../../pb-generated/agent-backend/websocket";
import { db } from "../database";
import { schema } from "../database/schema";
import { dbSchemaTypes } from "../database/type";
import { authenticationMiddleware } from "../middleware/auth";
import { agentManagerService } from "../services/agentManager";
import { baseResponseSchema, errorResponseSchema } from "../types";
import { generatePVCManifest } from "../utils/k8s-manifest";
import { logger } from "../utils/logger";

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
					});
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
					});
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
					const body = ctx.body;

					if (!ctx.profile) {
						return ctx.status(401, {
							success: false,
							message: "Unauthorized",
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
					const existingPvc =
						await db.query.k8sPersistentVolumeClaims.findFirst({
							where: {
								clusterId: cluster.id,
								name: body.name,
								namespace: body.namespace,
							},
						});
					if (existingPvc) {
						return ctx.status(409, {
							success: false,
							message: "PVC with the same name and namespace already exists",
							timestamp: Date.now(),
						});
					}

					const createData: InferInsertModel<
						typeof schema.k8sPersistentVolumeClaims
					> = {
						clusterId: cluster.id,
						ownerId: ctx.profile.id,
						name: body.name,
						namespace: body.namespace,
						phase: "Pending",
						capacity: Number(body.capacity),
						storageClass: body.storageClass || null,
						labels: {},
						annotations: {},
						autoCreated: false,
					};

					const [newPvc] = await db
						.insert(schema.k8sPersistentVolumeClaims)
						.values(createData)
						.onConflictDoNothing()
						.returning();

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
					} catch (error: any) {
						logger.error("Failed to send PVC create command to agent", {
							error: error.message,
							pvcName: body.name,
							namespace: body.namespace,
							agentId: cluster.agent?.id,
						});

						return ctx.status(202, {
							success: true,
							message: "PVC created in DB, sync will catch up via agent",
							timestamp: Date.now(),
						});
					}

					return ctx.status(201, {
						success: true,
						message: "PVC created successfully",
						data: { name: body.name },
						timestamp: Date.now(),
					});
				},
				{
					roleAuth: "pvc:create",
					body: Type.Object({
						name: Type.String({ minLength: 1 }),
						namespace: Type.String({ minLength: 1 }),
						storageClass: Type.Optional(Type.String({ minLength: 1 })),
						capacity: Type.Number({ minimum: 1 }),
						accessModes: Type.Optional(Type.Array(Type.String())),
					}),
					response: {
						201: baseResponseSchema(Type.Object({ name: Type.String() })),
						202: baseResponseSchema(Type.Optional(Type.String())),
						401: errorResponseSchema,
						404: errorResponseSchema,
						500: errorResponseSchema,
						409: errorResponseSchema,
					},
				},
			)
			.patch(
				"/:id",
				async (ctx) => {
					const { clusterId, id } = ctx.params;
					const body = ctx.body;

					const pvc = await db.query.k8sPersistentVolumeClaims.findFirst({
						where: {
							id: Number(id),
							clusterId: Number(clusterId),
						},
					});

					if (!pvc) {
						return ctx.status(404, {
							success: false,
							message: "PVC not found",
							timestamp: Date.now(),
						});
					}

					const isManager = ctx.userPermissions.has("pvc:manage");
					if (!isManager && pvc.ownerId !== ctx.profile?.id) {
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
						capacity: Type.Number({ minimum: 1 }),
					}),
					response: {
						200: baseResponseSchema(Type.Optional(Type.String())),
						403: errorResponseSchema,
						404: errorResponseSchema,
						500: errorResponseSchema,
					},
				},
			)
			.delete(
				"/:id",
				async (ctx) => {
					const { clusterId, id } = ctx.params;
					const pvc = await db.query.k8sPersistentVolumeClaims.findFirst({
						where: {
							id: Number(id),
							clusterId: Number(clusterId),
						},
					});

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
