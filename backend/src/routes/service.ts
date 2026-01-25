/** biome-ignore-all lint/suspicious/noExplicitAny: <explanation> */
import { Type } from "@sinclair/typebox";
import { Elysia } from "elysia";
import { db } from "../database";
import { dbSchemaTypes } from "../database/type";
import { authenticationMiddleware, checkPermission } from "../middleware/auth";
import { agentManagerService } from "../services/agentManager";
import { baseResponseSchema, errorResponseSchema } from "../types";
import { schema } from "../database/schema";
import { eq } from "drizzle-orm";
import { generateServiceManifest } from "../utils/k8s-manifest";
import { Command_CommandType } from "../../pb-generated/agent-backend/websocket";

export const serviceRoute = new Elysia({
	prefix: "/services/:clusterId",
	detail: { tags: ["Services"] },
})
	.use(authenticationMiddleware)
	.use(agentManagerService)
	.guard({ roleAuth: ["manager"] }, (app) =>
		app.get(
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
				response: {
					200: baseResponseSchema(
						Type.Array(Type.Object(dbSchemaTypes.k8sServices)),
					),
					400: errorResponseSchema,
				},
			},
		),
	)
	.guard({ userAuth: { requiredProfile: true } }, (app) =>
		app
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

					// Similar to pods/deployments, limit by "owner" or visibility if needed.
					// Schema `k8sServices` doesn't strictly have `ownerId` in the view I saw earlier?
					// Let's check schema.ts content provided in Step 7.
					// `k8sServices` has `clusterId`, `nodeId`, `podId`, etc. No `ownerId`.
					// So effectively, if we don't have owner on Service, regular users might not see them
					// unless we link them to Pods they own?
					// For now, let's return all for the cluster if the user has access to the cluster?
					// Or filtering by namespace if we had namespace RBAC.
					// Given the constraint, if there's no ownerId, maybe return all or none?
					// k8sDeployments and k8sPods have ownerId.
					// Users usually need to see services to know how to connect.
					// Let's return all services in the cluster for now, or filter by namespaces user owns pods in?
					// Simple approach: Return all services for the cluster for now.

					const services = await db.query.k8sServices.findMany({
						where: {
							clusterId: Number(clusterId),
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
					response: {
						200: baseResponseSchema(
							Type.Array(Type.Object(dbSchemaTypes.k8sServices)),
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
					const service = await db.query.k8sServices.findFirst({
						where: {
							id: Number(id),
							clusterId: Number(clusterId),
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
					response: {
						200: baseResponseSchema(Type.Object(dbSchemaTypes.k8sServices)),
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
						with: {
							agent: true,
						},
					});

					if (!cluster || !cluster.agent) {
						return ctx.status(404, {
							success: false,
							message: "Cluster not found",
							timestamp: Date.now(),
						});
					}

					const manifest = generateServiceManifest({
						name: body.name,
						namespace: body.namespace,
						type: body.type,
						selector: body.selector,
						ports: body.ports,
						labels: body.labels,
					});

					try {
						const response = await ctx.agentManager.sendCommand(
							cluster.agent.id,
							cluster.id,
							{
								id: crypto.randomUUID(),
								type: Command_CommandType.CREATE_SERVICE,
								payload: manifest,
								targetNamespace: body.namespace,
								targetName: body.name,
							},
						);

						return ctx.status(201, {
							success: true,
							message: "Service creation command sent",
							data: response.data,
							timestamp: Date.now(),
						});
					} catch (error: any) {
						return ctx.status(500, {
							success: false,
							message: `Agent error: ${error.message}`,
							timestamp: Date.now(),
						});
					}
				},
				{
					detail: { tags: ["Services"] },
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
						201: baseResponseSchema(Type.Optional(Type.String())),
						404: errorResponseSchema,
						500: errorResponseSchema,
					},
				},
			)
			.patch(
				"/:id",
				async (ctx) => {
					const clusterId = Number(ctx.params.clusterId);
					const svcId = Number(ctx.params.id);
					const body = ctx.body;

					const cluster = await db.query.k8sCluster.findFirst({
						where: {
							id: clusterId,
						},
						with: {
							agent: true,
						},
					});

					if (!cluster || !cluster.agent) {
						return ctx.status(404, {
							success: false,
							message: "Cluster not found",
							timestamp: Date.now(),
						});
					}

					const service = await db.query.k8sServices.findFirst({
						where: {
							id: svcId,
							clusterId: clusterId,
						},
					});

					if (!service) {
						return ctx.status(404, {
							success: false,
							message: "Service not found",
							timestamp: Date.now(),
						});
					}

					// Reconstruct manifest
					const labels = service.labels ? JSON.parse(service.labels) : {};
					const selector = service.selector ? JSON.parse(service.selector) : {};
					// Ports are not fully in DB structured? Schema: internalPort (int), externalPort(int).
					// This is a simplified view in DB vs complex Multi-port service.
					// If we only store one port in DB, we can't fully reconstruct multi-port service manifest from DB.
					// Valid limitation. We will use what matches or what is provided.

					const manifest = generateServiceManifest({
						name: service.name,
						namespace: service.namespace,
						type: (body.type as any) || service.type || "ClusterIP",
						selector: body.selector || selector,
						// If body.ports provided, use them. Else...?
						// If DB only has single port, and user doesn't provide ports, we might degrade service to single port if we apply.
						// Ideally checking if we have Command_CommandType.EDIT_RESOURCE works via Patch?
						// If we assume user sends everything they want to be in the final state.
						ports: body.ports || [
							{
								port: service.internalPort,
								targetPort: service.internalPort, // approximation
								nodePort: service.externalPort || undefined,
							},
						],
						labels: body.labels || labels,
					});

					try {
						const response = await ctx.agentManager.sendCommand(
							cluster.agent.id,
							cluster.id,
							{
								id: crypto.randomUUID(),
								type: Command_CommandType.EDIT_RESOURCE,
								payload: manifest,
								targetNamespace: service.namespace,
								targetName: service.name,
							},
						);

						return ctx.status(200, {
							success: true,
							message: "Service update command sent",
							data: response.data,
							timestamp: Date.now(),
						});
					} catch (error: any) {
						return ctx.status(500, {
							success: false,
							message: `Agent error: ${error.message}`,
							timestamp: Date.now(),
						});
					}
				},
				{
					detail: { tags: ["Services"] },
					body: Type.Object({
						type: Type.Optional(
							Type.Union([
								Type.Literal("ClusterIP"),
								Type.Literal("NodePort"),
								Type.Literal("LoadBalancer"),
							]),
						),
						selector: Type.Optional(Type.Record(Type.String(), Type.String())),
						ports: Type.Optional(
							Type.Array(
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
						),
						labels: Type.Optional(Type.Record(Type.String(), Type.String())),
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
					const svcId = Number(ctx.params.id);
					const clusterId = Number(ctx.params.clusterId);

					const service = await db.query.k8sServices.findFirst({
						where: {
							id: svcId,
							clusterId: clusterId,
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
						with: {
							agent: true,
						},
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
					} catch (error: any) {
						return ctx.status(500, {
							success: false,
							message: `Agent error: ${error.message}`,
							timestamp: Date.now(),
						});
					}
				},
				{
					detail: { tags: ["Services"] },
					response: {
						200: baseResponseSchema(Type.Object(dbSchemaTypes.k8sServices)),
						404: errorResponseSchema,
						500: errorResponseSchema,
					},
				},
			),
	);
