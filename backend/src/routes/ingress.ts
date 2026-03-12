import { logger } from "../utils/logger";
import { Type } from "@sinclair/typebox";
import { eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { Command_CommandType } from "../../pb-generated/agent-backend/websocket";
import { db } from "../database";
import { schema } from "../database/schema";
import { dbSchemaTypes } from "../database/type";
import { authenticationMiddleware } from "../middleware/auth";
import { agentService } from "../services/agent.service";
import { agentManagerService } from "../services/agentManager";
import { baseResponseSchema, errorResponseSchema } from "../types";
import {
	generateIngressRouteManifest,
	generateServiceManifest,
} from "../utils/k8s-manifest";

const ingressWithServiceSchema = Type.Object({
	...dbSchemaTypes.k8sIngresses,
	service: Type.Union([
		Type.Object({
			...dbSchemaTypes.k8sServices,
			ports: Type.Any(),
		}),
		Type.Null(),
	]),
});

export const ingressRoute = new Elysia({
	prefix: "/ingresses/:clusterId",
	detail: { tags: ["Ingresses"] },
})
	.use(authenticationMiddleware)
	.use(agentManagerService)
	.guard({ userAuth: { requiredProfile: true } }, (app) =>
		app
			.get(
				"/",
				async (ctx) => {
					const { clusterId } = ctx.params;
					const ingresses = await db.query.k8sIngresses.findMany({
						// where: eq(schema.k8sIngresses.clusterId, Number(clusterId)),
						where: {
							clusterId: Number(clusterId),
						},
						with: {
							service: true,
						},
					});
					return ctx.status(200, {
						success: true,
						message: "Ingresses fetched successfully",
						data: ingresses,
						timestamp: Date.now(),
					});
				},
				{
					detail: { tags: ["Ingresses"] },
					roleAuth: "ingress:read",
					response: {
						200: baseResponseSchema(Type.Array(ingressWithServiceSchema)),
					},
				},
			)
			.get(
				"/:id",
				async (ctx) => {
					const { clusterId, id } = ctx.params;
					// Check authorization: user must be manager or ingress owner
					const isManager =
						(ctx as any).userPermissions.has("ingress:manage") ||
						(ctx as any).userPermissions.has("ingress:read");
					const ingress = await db.query.k8sIngresses.findFirst({
						where: isManager
							? { id: Number(id), clusterId: Number(clusterId) }
							: {
									id: Number(id),
									clusterId: Number(clusterId),
									ownerId: ctx.profile?.id ?? "NONE",
								},
						with: {
							service: true,
						},
					});

					if (!ingress) {
						return ctx.status(404, {
							success: false,
							message: "Ingress not found",
							timestamp: Date.now(),
						});
					}

					return ctx.status(200, {
						success: true,
						message: "Ingress fetched successfully",
						data: ingress,
						timestamp: Date.now(),
					});
				},
				{
					detail: { tags: ["Ingresses"] },
					roleAuth: "ingress:read",
					response: {
						200: baseResponseSchema(ingressWithServiceSchema),
						404: errorResponseSchema,
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

					const cluster = await db.query.k8sCluster.findFirst({
						// where: eq(schema.k8sCluster.id, clusterId),
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

					const routeManifest = generateIngressRouteManifest({
						name: `${body.serviceName}-route`,
						namespace: body.namespace,
						protocol: body.protocol,
						port: externalPort || 0,
						internalPort: body.internalPort,
						serviceName: body.serviceName,
						domain: body.domain,
					});

					// --- SERVICE CREATION LOGIC ---
					// If selector is provided, we ensure the service exists or create it
					let serviceId: number;
					if (body.selector) {
						const existingSvc = await db.query.k8sServices.findFirst({
							where: {
								clusterId,
								name: body.serviceName,
								namespace: body.namespace,
							},
						});

						if (!existingSvc) {
							const svcProtocol = (
								body.protocol.toUpperCase() === "HTTP"
									? "TCP"
									: body.protocol.toUpperCase()
							) as "TCP" | "UDP";
							logger.info(svcProtocol);
							// Create Service in DB
							const [svc] = await db
								.insert(schema.k8sServices)
								.values({
									clusterId,
									ownerId: ctx.profile?.id,
									name: body.serviceName,
									namespace: body.namespace,
									type: "ClusterIP", // Default for exposure
									selector: JSON.stringify(body.selector),
									labels: JSON.stringify(body.labels || {}),
									ports: [
										{
											port: body.internalPort,
											targetPort: body.internalPort,
											protocol: svcProtocol,
										},
									],
									updatedAt: new Date(),
								})
								.returning();
							if (!svc) {
								return ctx.status(500, {
									success: false,
									message: "Failed to create service",
									timestamp: Date.now(),
								});
							}
							serviceId = svc.id;

							// Send Create Service command to Agent
							const svcManifest = generateServiceManifest({
								name: body.serviceName,
								namespace: body.namespace,
								type: "ClusterIP",
								selector: body.selector,
								ports: [
									{
										port: body.internalPort,
										targetPort: body.internalPort,
										protocol: svcProtocol,
									},
								],
								labels: body.labels,
							});

							await ctx.agentManager.sendCommand(cluster.agent.id, cluster.id, {
								id: crypto.randomUUID(),
								type: Command_CommandType.CREATE_SERVICE,
								payload: svcManifest,
								targetNamespace: body.namespace,
								targetName: body.serviceName,
							});
						} else {
							serviceId = existingSvc.id;
						}
					} else {
						// Try to find existing service by name and namespace
						const existingSvc = await db.query.k8sServices.findFirst({
							where: {
								clusterId,
								name: body.serviceName,
								namespace: body.namespace,
							},
						});
						if (!existingSvc) {
							return ctx.status(404, {
								success: false,
								message: "Service not found",
								timestamp: Date.now(),
							});
						}
						serviceId = existingSvc.id;
					}
					// ------------------------------

					// Check for existing ingress with same name and namespace
					const existingIngress = await db.query.k8sIngresses.findFirst({
						where: {
							clusterId,
							name: `${body.serviceName}-route`,
							namespace: body.namespace,
						},
					});

					if (existingIngress) {
						return ctx.status("Conflict", {
							success: false,
							message: "Ingress with this name and namespace already exists",
							timestamp: Date.now(),
						});
					}

					try {
						await ctx.agentManager.sendCommand(cluster.agent.id, cluster.id, {
							id: crypto.randomUUID(),
							type: Command_CommandType.CREATE_INGRESS,
							payload: routeManifest,
							targetNamespace: body.namespace,
							targetName: `${body.serviceName}-route`,
						});

						const [newIngress] = await db
							.insert(schema.k8sIngresses)
							.values({
								clusterId,
								name: `${body.serviceName}-route`,
								namespace: body.namespace,
								serviceName: body.serviceName,
								domain: body.domain,
								port: externalPort,
								protocol: body.protocol,
								updatedAt: new Date(),
								serviceId: serviceId,
							})
							.returning();
						if (!newIngress) {
							return ctx.status(500, {
								success: false,
								message: "Failed to create ingress",
								timestamp: Date.now(),
							});
						}

						return ctx.status(201, {
							success: true,
							message: "Ingress creation initiated",
							data: newIngress,
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
					detail: { tags: ["Ingresses"] },
					roleAuth: "ingress:create",
					body: Type.Object({
						serviceName: Type.String(),
						namespace: Type.String(),
						protocol: Type.Union([
							Type.Literal("http"),
							Type.Literal("tcp"),
							Type.Literal("udp"),
						]),
						internalPort: Type.Number(),
						externalPort: Type.Optional(Type.Number()),
						domain: Type.Optional(Type.String()),
						selector: Type.Optional(Type.Record(Type.String(), Type.String())),
						labels: Type.Optional(Type.Record(Type.String(), Type.String())),
					}),
					response: {
						201: baseResponseSchema(Type.Object(dbSchemaTypes.k8sIngresses)),
						400: errorResponseSchema,
						404: errorResponseSchema,
						Conflict: errorResponseSchema,
						500: errorResponseSchema,
					},
				},
			)
			.delete(
				"/:id",
				async (ctx) => {
					const id = Number(ctx.params.id);
					const clusterId = Number(ctx.params.clusterId);

					const ingress = await db.query.k8sIngresses.findFirst({
						// where: and(
						// 	eq(schema.k8sIngresses.id, id),
						// 	eq(schema.k8sIngresses.clusterId, clusterId),
						// ),
						where: {
							id,
							clusterId,
						},
					});

					if (!ingress) {
						return ctx.status(404, {
							success: false,
							message: "Ingress not found",
							timestamp: Date.now(),
						});
					}

					const cluster = await db.query.k8sCluster.findFirst({
						// where: eq(schema.k8sCluster.id, clusterId),
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
							type: Command_CommandType.DELETE_INGRESS,
							targetNamespace: ingress.namespace,
							targetName: ingress.name,
							payload:
								ingress.protocol === "http"
									? "IngressRoute"
									: ingress.protocol === "tcp"
										? "IngressRouteTCP"
										: "IngressRouteUDP",
						});

						if (ingress.port) {
							await agentService.releaseGatewayPort(clusterId, ingress.port);
						}

						await db
							.delete(schema.k8sIngresses)
							.where(eq(schema.k8sIngresses.id, id));

						return ctx.status(200, {
							success: true,
							message: "Ingress deleted successfully",
							data: ingress,
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
					detail: { tags: ["Ingresses"] },
					roleAuth: "ingress:delete",
					response: {
						200: baseResponseSchema(Type.Object(dbSchemaTypes.k8sIngresses)),
						404: errorResponseSchema,
						500: errorResponseSchema,
					},
				},
			),
	);
