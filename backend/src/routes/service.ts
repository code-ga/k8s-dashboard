import { Type } from "@sinclair/typebox";
import { eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { Command_CommandType } from "../../pb-generated/agent-backend/websocket";
import { db } from "../database";
import { schema } from "../database/schema";
import { dbSchemaTypes, type SchemaStatic } from "../database/type";
import { authenticationMiddleware } from "../middleware/auth";
import { agentManagerService } from "../services/agentManager";
import { scalingController } from "../services/scaling.controller";
import { baseResponseSchema, errorResponseSchema } from "../types";
import { generateServiceManifest } from "../utils/k8s-manifest";
import { logger } from "../utils/logger";

export const serviceRoute = new Elysia({
	prefix: "/services/:clusterId",
	detail: { tags: ["Services"] },
})
	.use(authenticationMiddleware)
	.use(agentManagerService)
	.guard({ userAuth: { requiredProfile: true } }, (app) =>
		app
			.get(
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
					const services = await db.query.k8sServices.findMany({
						where: {
							clusterId: Number(clusterId),
						},
						with: {
							ingresses: true,
						},
					});
					return ctx.status(200, {
						success: true,
						message: "Services fetched successfully",
						data: services,
						timestamp: Date.now(),
					});
				},
				{
					detail: { tags: ["Services"] },
					roleAuth: "service:manage",
					response: {
						200: baseResponseSchema(
							Type.Array(Type.Object(dbSchemaTypes.k8sServices)),
						),
						400: errorResponseSchema,
					},
				},
			)
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

					const services = await db.query.k8sServices.findMany({
						where: {
							clusterId: Number(clusterId),
							ownerId: ctx.profile?.id ?? "",
						},
						with: {
							ingresses: true,
						},
					});
					return ctx.status(200, {
						success: true,
						message: "Services fetched successfully",
						data: services,
						timestamp: Date.now(),
					});
				},
				{
					detail: { tags: ["Services"] },
					roleAuth: "service:read",
					response: {
						200: baseResponseSchema(
							Type.Array(
								Type.Object({
									...dbSchemaTypes.k8sServices,
									ingresses: Type.Array(
										Type.Object(dbSchemaTypes.k8sIngresses),
									),
								}),
							),
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
							message: "Cluster ID and Service ID are required",
							timestamp: Date.now(),
						});
					}

					// Logic to check if user can see this service
					const userPermissions = ctx.userPermissions as Set<string>;
					const isManager =
						userPermissions.has("service:manage") ||
						userPermissions.has("service:read");

					const service = await db.query.k8sServices.findFirst({
						where: isManager
							? { id: Number(id), clusterId: Number(clusterId) }
							: {
									id: Number(id),
									clusterId: Number(clusterId),
									ownerId: ctx.profile?.id ?? "",
								},
						with: {
							ingresses: true,
						},
					});
					if (!service) {
						return ctx.status(404, {
							success: false,
							message: "Service not found",
							timestamp: Date.now(),
						});
					}
					return ctx.status(200, {
						success: true,
						message: "Service fetched successfully",
						data: service,
						timestamp: Date.now(),
					});
				},
				{
					detail: { tags: ["Services"] },
					roleAuth: "service:read",
					response: {
						200: baseResponseSchema(
							Type.Object({
								...dbSchemaTypes.k8sServices,
								ingresses: Type.Array(Type.Object(dbSchemaTypes.k8sIngresses)),
							}),
						),
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
						with: { agent: true },
					});

					if (!cluster || !cluster.agent) {
						return ctx.status(404, {
							success: false,
							message: "Cluster not found",
							timestamp: Date.now(),
						});
					}

					let newSvc:
						| SchemaStatic<typeof dbSchemaTypes.k8sServices>
						| undefined;

					try {
						[newSvc] = await db
							.insert(schema.k8sServices)
							.values({
								clusterId: cluster.id,
								ownerId: ctx.profile?.id ?? "",
								name: body.name,
								namespace: body.namespace,
								type: body.type,
								selector: JSON.stringify(body.selector),
								labels: JSON.stringify(body.labels || {}),
								ports: body.ports,
								updatedAt: new Date(),
							})
							.returning();
						if (!newSvc) {
							return ctx.status(500, {
								success: false,
								message: "Service not created",
								timestamp: Date.now(),
							});
						}
					} catch (dbError) {
						logger.error("DB Insert Failed:", dbError);
						const message =
							dbError instanceof Error ? dbError.message : String(dbError);
						return ctx.status(500, {
							success: false,
							message: `Database error: ${message}`,
							timestamp: Date.now(),
						});
					}

					try {
						const svcManifest = generateServiceManifest({
							name: body.name,
							namespace: body.namespace,
							type: body.type,
							selector: body.selector,
							ports: body.ports,
							labels: body.labels,
						});

						await ctx.agentManager.sendCommand(cluster.agent.id, cluster.id, {
							id: crypto.randomUUID(),
							type: Command_CommandType.CREATE_SERVICE,
							payload: svcManifest,
							targetNamespace: body.namespace,
							targetName: body.name,
						});

						return ctx.status(201, {
							success: true,
							message: "Service creation command sent",
							data: newSvc,
							timestamp: Date.now(),
						});
					} catch (error) {
						logger.error("Agent Command Failed:", error);
						return ctx.status(200, {
							success: true,
							message:
								"Service created in DB but Agent is unreachable. Will sync later.",
							data: newSvc,
							timestamp: Date.now(),
						});
					}
				},
				{
					detail: { tags: ["Services"] },
					roleAuth: "service:create",
					body: Type.Object({
						name: Type.String(),
						namespace: Type.String(),
						type: Type.Union([
							Type.Literal("ClusterIP"),
							Type.Literal("NodePort"),
							Type.Literal("LoadBalancer"),
						]),
						selector: Type.Record(Type.String(), Type.String()),
						ports: Type.Array(
							Type.Object({
								port: Type.Number(),
								targetPort: Type.Number(),
								nodePort: Type.Optional(Type.Number()),
								protocol: Type.Optional(
									Type.Union([Type.Literal("TCP"), Type.Literal("UDP")]),
								),
								name: Type.Optional(Type.String()),
							}),
						),
						labels: Type.Optional(Type.Record(Type.String(), Type.String())),
					}),
					response: {
						201: baseResponseSchema(Type.Object(dbSchemaTypes.k8sServices)),
						200: baseResponseSchema(Type.Object(dbSchemaTypes.k8sServices)),
						404: errorResponseSchema,
						500: errorResponseSchema,
					},
				},
			)
			.delete(
				"/:id",
				async (ctx) => {
					const svcId = Number(ctx.params.id);
					const clusterId = Number(ctx.params.clusterId);

					// Check access
					const isManager = ctx.userPermissions.has("service:delete");

					const service = await db.query.k8sServices.findFirst({
						where: isManager
							? { id: svcId, clusterId: clusterId }
							: {
									id: svcId,
									clusterId: clusterId,
									ownerId: ctx.profile?.id ?? "",
								},
					});

					if (!service) {
						return ctx.status(404, {
							success: false,
							message: "Service not found",
							timestamp: Date.now(),
						});
					}

					const cluster = await db.query.k8sCluster.findFirst({
						where: {
							id: clusterId,
						},
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
							id: crypto.randomUUID(),
							type: Command_CommandType.DELETE_SERVICE,
							targetNamespace: service.namespace,
							targetName: service.name,
							payload: "Service",
						});

						await db
							.delete(schema.k8sServices)
							.where(eq(schema.k8sServices.id, svcId));

						return ctx.status(200, {
							success: true,
							message: "Service deleted successfully",
							data: service,
							timestamp: Date.now(),
						});
					} catch (error) {
						logger.error("Agent Delete Command Failed:", error);
						const message =
							error instanceof Error ? error.message : String(error);
						return ctx.status(500, {
							success: false,
							message: `Agent error: ${message}`,
							timestamp: Date.now(),
						});
					}
				},
				{
					detail: { tags: ["Services"] },
					roleAuth: "service:delete",
					response: {
						200: baseResponseSchema(Type.Object(dbSchemaTypes.k8sServices)),
						404: errorResponseSchema,
						500: errorResponseSchema,
					},
				},
			)
			.post(
				"/wake/:deploymentId",
				async (ctx) => {
					const deploymentId = Number(ctx.params.deploymentId);
					try {
						await scalingController.wakeUpDeployment(deploymentId);
						return ctx.status(200, {
							success: true,
							data: {},
							message: "Deployment waking up",
							timestamp: Date.now(),
						});
					} catch (error) {
						logger.error("Wake up Failed:", error);
						const message =
							error instanceof Error ? error.message : String(error);
						return ctx.status(500, {
							success: false,
							message: `Wake up error: ${message}`,
							timestamp: Date.now(),
						});
					}
				},
				{
					detail: { tags: ["Services"] },
					roleAuth: "service:read", // wake requires read at least, or maybe manage?
					params: Type.Object({
						clusterId: Type.String(),
						deploymentId: Type.String(),
					}),
					response: {
						200: baseResponseSchema(Type.Object({})),
						500: errorResponseSchema,
					},
				},
			),
	);
