import { Type } from "@sinclair/typebox";
import { Elysia } from "elysia";
import { db } from "../database";
import { dbSchemaTypes } from "../database/type";
import { authenticationMiddleware } from "../middleware/auth";
import { agentManagerService } from "../services/agentManager";
import { agentService } from "../services/agent.service";
import { scalingController } from "../services/scaling.controller";
import { baseResponseSchema, errorResponseSchema } from "../types";
import { schema } from "../database/schema";
import { eq, and } from "drizzle-orm";
import {
	generateServiceManifest,
	generateIngressRouteManifest,
} from "../utils/k8s-manifest";
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
							ownerId: ctx.profile.id,
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
				"/expose",
				async (ctx) => {
					const clusterId = Number(ctx.params.clusterId);
					const body = ctx.body;
					if (body.protocol === "tcp" || body.protocol === "udp") {
						return ctx.status(400, {
							success: false,
							message:
								"This feature is temporary unavailable due to maintenance and security reasons",
							timestamp: Date.now(),
						});
					}
					if (!body.externalPort && body.protocol === "http") {
						return ctx.status(400, {
							success: false,
							message: "External port is required for http protocol",
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

					if (
						!body.domain &&
						body.protocol === "http" &&
						!cluster.clusterDomain
					) {
						return ctx.status(400, {
							success: false,
							message: "Domain is required for http protocol",
							timestamp: Date.now(),
						});
					}

					let externalPort = body.externalPort;
					if (!externalPort && body.protocol !== "http") {
						const portEntry = await agentService.allocateGatewayPort(
							clusterId,
							body.protocol,
						);
						if (!portEntry) {
							throw new Error("Failed to allocate port");
						}
						externalPort = portEntry.port;
					}

					// 1. Generate Service Manifest (ClusterIP)
					const svcManifest = generateServiceManifest({
						name: body.name,
						namespace: body.namespace,
						type: "ClusterIP",
						selector: body.selector,
						ports: [
							{
								port: body.internalPort,
								targetPort: body.internalPort,
								protocol: body.protocol === "udp" ? "UDP" : "TCP",
							},
						],
						labels: body.labels,
					});

					// 2. Generate IngressRoute Manifest
					const routeManifest = generateIngressRouteManifest({
						name: `${body.name}-route`,
						namespace: body.namespace,
						protocol: body.protocol,
						port: externalPort || 0,
						internalPort: body.internalPort,
						serviceName: body.name,
						domain: body.domain,
						labels: body.labels,
					});

					try {
						// Send Service Command
						await ctx.agentManager.sendCommand(cluster.agent.id, cluster.id, {
							id: crypto.randomUUID(),
							type: Command_CommandType.CREATE_SERVICE,
							payload: svcManifest,
							targetNamespace: body.namespace,
							targetName: body.name,
						});

						// Send Route Command
						await ctx.agentManager.sendCommand(cluster.agent.id, cluster.id, {
							id: crypto.randomUUID(),
							type: Command_CommandType.CREATE_RESOURCE,
							payload: routeManifest,
							targetNamespace: body.namespace,
							targetName: `${body.name}-route`,
						});

						await db
							.update(schema.k8sServices)
							.set({
								externalPort,
								domain: body.domain,
								exposureProtocol: body.protocol,
							})
							.where(
								and(
									eq(schema.k8sServices.clusterId, clusterId),
									eq(schema.k8sServices.name, body.name),
									eq(schema.k8sServices.namespace, body.namespace),
								),
							);

						return ctx.status(200, {
							success: true,
							message: "Expose commands sent",
							data: { externalPort },
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
						protocol: Type.Union([
							Type.Literal("http"),
							Type.Literal("tcp"),
							Type.Literal("udp"),
						]),
						internalPort: Type.Number(),
						externalPort: Type.Optional(Type.Number()),
						domain: Type.Optional(Type.String()),
						selector: Type.Record(Type.String(), Type.String()),
						labels: Type.Optional(Type.Record(Type.String(), Type.String())),
					}),
					response: {
						200: baseResponseSchema(
							Type.Object({ externalPort: Type.Optional(Type.Number()) }),
						),
						404: errorResponseSchema,
						400: errorResponseSchema,
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
							type: Command_CommandType.DELETE_RESOURCE,
							targetNamespace: service.namespace,
							targetName: `${service.name}-route`,
							payload: "IngressRoute", // Traefik resource
						});

						if (service.externalPort) {
							await agentService.releaseGatewayPort(
								clusterId,
								service.externalPort,
							);
						}

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
			)
			.post(
				"/de-expose/:id",
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
							type: Command_CommandType.DELETE_RESOURCE,
							targetNamespace: service.namespace,
							targetName: `${service.name}-route`,
							payload: "IngressRoute",
						});

						if (service.externalPort) {
							await agentService.releaseGatewayPort(
								clusterId,
								service.externalPort,
							);
						}

						await db
							.update(schema.k8sServices)
							.set({
								externalPort: null,
								domain: null,
								exposureProtocol: null,
							})
							.where(eq(schema.k8sServices.id, svcId));

						return ctx.status(200, {
							success: true,
							message: "Service de-exposed successfully",
							data: {},
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
						200: baseResponseSchema(Type.Object({})),
						404: errorResponseSchema,
						500: errorResponseSchema,
					},
				},
			)
			.post(
				"/allocate",
				async (ctx) => {
					const { clusterId } = ctx.params;
					const { protocol } = ctx.body;

					try {
						const portEntry = await agentService.allocateGatewayPort(
							Number(clusterId),
							protocol,
						);
						if (!portEntry) {
							throw new Error("Failed to allocate port");
						}
						return ctx.status(201, {
							success: true,
							message: "Port allocated successfully",
							data: portEntry,
							timestamp: Date.now(),
						});
					} catch (error: any) {
						return ctx.status(500, {
							success: false,
							message: `Allocation error: ${error.message}`,
							timestamp: Date.now(),
						});
					}
				},
				{
					detail: { tags: ["Services"] },
					body: Type.Object({
						protocol: Type.Union([
							Type.Literal("http"),
							Type.Literal("tcp"),
							Type.Literal("udp"),
						]),
					}),
					response: {
						201: baseResponseSchema(Type.Object(dbSchemaTypes.gatewayPorts)),
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
					} catch (error: any) {
						return ctx.status(500, {
							success: false,
							message: `Wake up error: ${error.message}`,
							timestamp: Date.now(),
						});
					}
				},
				{
					detail: { tags: ["Services"] },
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
