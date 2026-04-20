import { Type } from "@sinclair/typebox";
import { Elysia } from "elysia";
import { Command_CommandType } from "../../pb-generated/agent-backend/websocket";
import { db } from "../database";
import { dbSchemaTypes } from "../database/type";
import { authenticationMiddleware } from "../middleware/auth";
import { agentManagerService } from "../services/agentManager";
import { baseResponseSchema, errorResponseSchema } from "../types";
import { generatePVManifest } from "../utils/k8s-manifest";
import { schema } from "../database/schema";

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
					roleAuth: "pv:create",
					body: Type.Object({
						name: Type.String(),
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

					const pv = await db.query.k8sPersistentVolumes.findFirst({
						where: {
							clusterId: Number(clusterId),
							name: name as string,
						},
					});

					if (!pv) {
						return ctx.status(404, {
							success: false,
							message: "PersistentVolume not found",
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
							targetName: name as string,
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
