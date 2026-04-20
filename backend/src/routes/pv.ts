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
import { generatePVManifest } from "../utils/k8s-manifest";
import { logger } from "../utils/logger";

export const pvRoute = new Elysia({
	prefix: "/pvs/:clusterId",
	detail: { tags: ["PersistentVolumes"] },
})
	.use(authenticationMiddleware)
	.use(agentManagerService)
	.guard({ userAuth: { requiredProfile: true } }, (app) =>
		app
			.get(
				"/all",
				async (ctx) => {
					const { clusterId } = ctx.params;
					const pvs = await db.query.k8sPersistentVolumes.findMany({
						where: { clusterId: Number(clusterId) },
					});
					return ctx.status(200, {
						success: true,
						message: "PersistentVolumes fetched successfully",
						data: pvs,
						timestamp: Date.now(),
					});
				},
				{
					roleAuth: "pv:manage",
					response: {
						200: baseResponseSchema(
							Type.Array(Type.Object(dbSchemaTypes.k8sPersistentVolumes)),
						),
						404: errorResponseSchema,
					},
				},
			)
			.get(
				"/",
				async (ctx) => {
					const { clusterId } = ctx.params;
					const pvs = await db.query.k8sPersistentVolumes.findMany({
						where: { clusterId: Number(clusterId) },
					});
					return ctx.status(200, {
						success: true,
						message: "PersistentVolumes fetched successfully",
						data: pvs,
						timestamp: Date.now(),
					});
				},
				{
					roleAuth: "pv:read",
					response: {
						200: baseResponseSchema(
							Type.Array(Type.Object(dbSchemaTypes.k8sPersistentVolumes)),
						),
						404: errorResponseSchema,
					},
				},
			)
			.get(
				"/:id",
				async (ctx) => {
					const { clusterId, id } = ctx.params;

					const pv = await db.query.k8sPersistentVolumes.findFirst({
						where: {
							id: Number(id),
							clusterId: Number(clusterId),
						},
					});

					if (!pv) {
						return ctx.status(404, {
							success: false,
							message: "PersistentVolume not found",
							timestamp: Date.now(),
						});
					}

					const isManager = ctx.userPermissions.has("pv:manage");
					if (!isManager && pv.ownerId !== ctx.profile?.id) {
						return ctx.status(403, {
							success: false,
							message: "Forbidden",
							timestamp: Date.now(),
						});
					}

					return ctx.status(200, {
						success: true,
						message: "PersistentVolume fetched successfully",
						data: pv,
						timestamp: Date.now(),
					});
				},
				{
					roleAuth: "pv:read",
					response: {
						200: baseResponseSchema(
							Type.Object(dbSchemaTypes.k8sPersistentVolumes),
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

					const pv = await db.query.k8sPersistentVolumes.findFirst({
						where: {
							id: Number(id),
							clusterId: Number(clusterId),
						},
					});

					if (!pv) {
						return ctx.status(404, {
							success: false,
							message: "PersistentVolume not found",
							timestamp: Date.now(),
						});
					}

					const isManager = ctx.userPermissions.has("pv:manage");
					if (!isManager && pv.ownerId !== ctx.profile?.id) {
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
								targetName: pv.name,
								payload: JSON.stringify({ kind: "PersistentVolume" }),
							},
						);

						const describe = JSON.parse(response.data || "{}");
						const events = describe.events || [];
						return ctx.status(200, {
							success: true,
							message: "Describe fetched",
							data: {
								...describe,
								events,
							},
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
					roleAuth: "pv:read",
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

					const existingPv = await db.query.k8sPersistentVolumes.findFirst({
						where: {
							clusterId: cluster.id,
							name: body.name,
						},
					});
					if (existingPv) {
						return ctx.status(409, {
							success: false,
							message: "PersistentVolume with the same name already exists",
							timestamp: Date.now(),
						});
					}

					const createData: InferInsertModel<
						typeof schema.k8sPersistentVolumes
					> = {
						clusterId: cluster.id,
						ownerId: ctx.profile?.id || "",
						name: body.name,
						capacity: Number(body.capacity),
						phase: "Available",
						reclaimPolicy: body.reclaimPolicy || "Retain",
						storageClass: body.storageClass || null,
						boundPvc: null,
						accessModes: { data: body.accessModes || [] },
						annotations: body.annotations || {},
						labels: body.labels || {},
						autoCreated: false,
					};

					let newPv:
						| SchemaStatic<typeof dbSchemaTypes.k8sPersistentVolumes>
						| undefined;

					try {
						[newPv] = await db
							.insert(schema.k8sPersistentVolumes)
							.values(createData)
							.returning();
						if (!newPv) {
							return ctx.status(500, {
								success: false,
								message: "Failed to create PersistentVolume",
								timestamp: Date.now(),
							});
						}
					} catch (dbError) {
						logger.error("DB Insert PersistentVolume Failed:", dbError);
						const message =
							dbError instanceof Error ? dbError.message : String(dbError);
						return ctx.status(500, {
							success: false,
							message: `Database error: ${message}`,
							timestamp: Date.now(),
						});
					}

					const manifest = generatePVManifest({
						name: body.name,
						capacity: body.capacity,
						storageClass: body.storageClass,
						accessModes: body.accessModes,
						reclaimPolicy: body.reclaimPolicy,
						nfs: body.nfs,
						hostPath: body.hostPath,
						annotations: body.annotations,
						labels: body.labels,
					});

					try {
						await ctx.agentManager.sendCommand(cluster.agent.id, cluster.id, {
							id: crypto.randomUUID(),
							type: Command_CommandType.CREATE_PV,
							targetNamespace: "",
							targetName: body.name,
							payload: manifest,
						});

						return ctx.status(201, {
							success: true,
							message: "PersistentVolume creation initiated",
							data: { name: body.name },
							timestamp: Date.now(),
						});
					} catch (error: any) {
						logger.error("Failed to send PV create command to agent", {
							error: error.message,
							pvName: body.name,
							agentId: cluster.agent?.id,
						});

						return ctx.status(200, {
							success: true,
							message:
								"PersistentVolume created in DB but Agent is unreachable. Will sync later.",
							timestamp: Date.now(),
						});
					}
				},
				{
					roleAuth: "pv:create",
					body: Type.Object({
						name: Type.String({ minLength: 1 }),
						capacity: Type.String(),
						storageClass: Type.Optional(Type.String()),
						accessModes: Type.Optional(Type.Array(Type.String())),
						reclaimPolicy: Type.Optional(
							Type.Union([Type.Literal("Retain"), Type.Literal("Delete")]),
						),
						nfs: Type.Optional(
							Type.Object({
								server: Type.String(),
								path: Type.String(),
							}),
						),
						hostPath: Type.Optional(Type.String()),
						annotations: Type.Optional(
							Type.Object(Type.String(), Type.String()),
						),
						labels: Type.Optional(Type.Object(Type.String(), Type.String())),
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

					const pv = await db.query.k8sPersistentVolumes.findFirst({
						where: {
							id: Number(id),
							clusterId: Number(clusterId),
						},
					});

					if (!pv) {
						return ctx.status(404, {
							success: false,
							message: "PersistentVolume not found",
							timestamp: Date.now(),
						});
					}

					const isManager = ctx.userPermissions.has("pv:manage");
					if (!isManager && pv.ownerId !== ctx.profile?.id) {
						return ctx.status(403, {
							success: false,
							message: "Forbidden",
							timestamp: Date.now(),
						});
					}

					if (!pv.k8sUid) {
						await db
							.delete(schema.k8sPersistentVolumes)
							.where(eq(schema.k8sPersistentVolumes.id, pv.id));
						return ctx.status(200, {
							success: true,
							message: "PersistentVolume deleted successfully",
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
							type: Command_CommandType.DELETE_PV,
							targetNamespace: "",
							targetName: pv.name,
							payload: "PersistentVolume",
						});

						return ctx.status(200, {
							success: true,
							message: "PersistentVolume deletion initiated",
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
					roleAuth: "pv:delete",
					response: {
						200: baseResponseSchema(Type.Optional(Type.String())),
						403: errorResponseSchema,
						404: errorResponseSchema,
						500: errorResponseSchema,
					},
				},
			),
	);
