import { Elysia } from "elysia";
import { authenticationMiddleware } from "../middleware/auth";
import { db } from "../database";
import { schema } from "../database/schema";
import { baseResponseSchema, errorResponseSchema } from "../types";
import { Type } from "@sinclair/typebox";
import { dbSchemaTypes } from "../database/type";
import { eq } from "drizzle-orm";
import { agentManagerService } from "../services/agentManager";

export const clusterRoute = new Elysia({ prefix: "/cluster" })
	.use(authenticationMiddleware)
	.use(agentManagerService)
	.guard({ userAuth: { requiredProfile: false } }, (app) =>
		app.get("/", async (ctx) => {
			const clusters = await db.select().from(schema.k8sCluster);
			return ctx.status(200, {
				success: true,
				message: "Cluster fetched successfully",
				data: clusters,
				timestamp: Date.now(),
			});
		}),
	)
	.guard(
		{
			userAuth: {
				requiredProfile: true,
			},
			roleAuth: ["manager"],
		},
		(app) =>
			app
				.post(
					"/",
					async (ctx) => {
						const { name, description, tags } = ctx.body;
						const agent = await db
							.insert(schema.clusterAgent)
							.values({})
							.returning();
						if (agent.length === 0 || !agent[0]) {
							return ctx.status(500, {
								success: false,
								message: "Failed to create agent",
								timestamp: Date.now(),
							});
						}
						const cluster = await db
							.insert(schema.k8sCluster)
							.values({
								name,
								description,
								tags,
								clusterDomain: ctx.body.clusterDomain,
								enableS3Service: ctx.body.enableS3Service || false,
								agentId: agent[0].id,
							})
							.returning();
						if (cluster.length === 0 || !cluster[0]) {
							return ctx.status(500, {
								success: false,
								message: "Failed to create cluster",
								timestamp: Date.now(),
							});
						}
						return ctx.status(201, {
							success: true,
							message: "Cluster created successfully",
							data: cluster[0],
							timestamp: Date.now(),
						});
					},
					{
						detail: {
							tags: ["Cluster"],
						},
						response: {
							201: baseResponseSchema(Type.Object(dbSchemaTypes.k8sCluster)),
							500: errorResponseSchema,
						},
						body: Type.Object({
							name: dbSchemaTypes.k8sCluster.name,
							description: dbSchemaTypes.k8sCluster.description,
							tags: dbSchemaTypes.k8sCluster.tags,
							clusterDomain: dbSchemaTypes.k8sCluster.clusterDomain,
							enableS3Service: Type.Optional(
								dbSchemaTypes.k8sCluster.enableS3Service,
							),
						}),
					},
				)
				.get(
					"/",
					async (ctx) => {
						const clusters = await db.select().from(schema.k8sCluster);
						return ctx.status(200, {
							success: true,
							message: "Cluster fetched successfully",
							data: clusters,
							timestamp: Date.now(),
						});
					},
					{
						detail: {
							tags: ["Cluster"],
						},
						response: {
							200: baseResponseSchema(
								Type.Array(Type.Object(dbSchemaTypes.k8sCluster)),
							),
						},
					},
				)
				.patch(
					"/:id",
					async (ctx) => {
						const { name, description, tags } = ctx.body;
						const cluster = await db
							.update(schema.k8sCluster)
							.set({
								name,
								description,
								tags,
								clusterDomain: ctx.body.clusterDomain,
								enableS3Service: ctx.body.enableS3Service,
							})
							.where(eq(schema.k8sCluster.id, Number(ctx.params.id)))
							.returning();
						if (cluster.length === 0 || !cluster[0]) {
							return ctx.status(404, {
								success: false,
								message: "Cluster not found",
								timestamp: Date.now(),
							});
						}
						return ctx.status(200, {
							success: true,
							message: `Cluster updated successfully. Please redeploy the agent to apply changes.`,
							data: cluster[0],
							timestamp: Date.now(),
						});
					},
					{
						detail: {
							tags: ["Cluster"],
						},
						response: {
							200: baseResponseSchema(Type.Object(dbSchemaTypes.k8sCluster)),
							404: errorResponseSchema,
						},
						body: Type.Partial(
							Type.Object({
								name: dbSchemaTypes.k8sCluster.name,
								description: dbSchemaTypes.k8sCluster.description,
								tags: dbSchemaTypes.k8sCluster.tags,
								enableS3Service: dbSchemaTypes.k8sCluster.enableS3Service,
								clusterDomain: dbSchemaTypes.k8sCluster.clusterDomain,
							}),
						),
					},
				)
				.delete(
					"/:id",
					async (ctx) => {
						const cluster = await db
							.delete(schema.k8sCluster)
							.where(eq(schema.k8sCluster.id, Number(ctx.params.id)))
							.returning();
						if (cluster.length === 0 || !cluster[0]) {
							return ctx.status(404, {
								success: false,
								message: "Cluster not found",
								timestamp: Date.now(),
							});
						}
						return ctx.status(200, {
							success: true,
							message: "Cluster deleted successfully",
							data: cluster[0],
							timestamp: Date.now(),
						});
					},
					{
						detail: {
							tags: ["Cluster"],
						},
						response: {
							200: baseResponseSchema(Type.Object(dbSchemaTypes.k8sCluster)),
							404: errorResponseSchema,
						},
					},
				)
				.get(
					"/:id",
					async (ctx) => {
						const cluster = await db
							.select()
							.from(schema.k8sCluster)
							.where(eq(schema.k8sCluster.id, Number(ctx.params.id)));
						if (cluster.length === 0 || !cluster[0]) {
							return ctx.status(404, {
								success: false,
								message: "Cluster not found",
								timestamp: Date.now(),
							});
						}
						return ctx.status(200, {
							success: true,
							message: "Cluster fetched successfully",
							data: cluster[0],
							timestamp: Date.now(),
						});
					},
					{
						detail: {
							tags: ["Cluster"],
						},
						response: {
							200: baseResponseSchema(Type.Object(dbSchemaTypes.k8sCluster)),
							404: errorResponseSchema,
						},
					},
				)
				.get(
					"/:id/agent-config",
					async (ctx) => {
						const cluster = await db
							.select()
							.from(schema.k8sCluster)
							.where(eq(schema.k8sCluster.id, Number(ctx.params.id)))
							.leftJoin(
								schema.clusterAgent,
								eq(schema.k8sCluster.agentId, schema.clusterAgent.id),
							);
						if (
							cluster.length === 0 ||
							!cluster[0] ||
							!cluster[0].clusterAgent
						) {
							return ctx.status(404, {
								success: false,
								message: "Cluster not found",
								timestamp: Date.now(),
							});
						}
						return ctx.status(200, {
							success: true,
							message: "Cluster agent config fetched successfully",
							data: {
								clusterId: cluster[0].k8sCluster.id,
								clusterName: cluster[0].k8sCluster.name,
								clusterToken: cluster[0].clusterAgent.token,
							},
							timestamp: Date.now(),
						});
					},
					{
						detail: {
							tags: ["Cluster"],
						},
						response: {
							200: baseResponseSchema(
								Type.Object({
									clusterId: Type.Number(),
									clusterName: Type.String(),
									clusterToken: Type.String(),
								}),
							),
							404: errorResponseSchema,
						},
					},
				),
	);

export type ClusterRoute = typeof clusterRoute;
