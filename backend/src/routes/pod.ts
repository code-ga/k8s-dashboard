import { Type } from "@sinclair/typebox";
import { Elysia } from "elysia";
import { db } from "../database";
import { dbSchemaTypes } from "../database/type";
import { authenticationMiddleware } from "../middleware/auth";
import { agentManagerService } from "../services/agentManager";
import { baseResponseSchema, errorResponseSchema } from "../types";

export const podRoute = new Elysia({ prefix: "/pods/:clusterId" })
	.use(authenticationMiddleware)
	.use(agentManagerService)
	.guard({ userAuth: true }, (app) =>
		app.get(
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
				const cluster = await db.query.k8sCluster.findFirst({
					where: {
						id: Number(clusterId),
					},
				});
				if (!cluster) {
					return ctx.status(404, {
						success: false,
						message: "Cluster not found",
						timestamp: Date.now(),
					});
				}
				const pods = await db.query.k8sPods.findMany({
					where: {
						owner: {
							id: ctx.user.id,
						},
						clusterId: Number(clusterId),
					},
				});
				return ctx.status(200, {
					success: true,
					message: "Pod fetched successfully",
					data: pods,
					timestamp: Date.now(),
				});
			},
			{
				response: {
					200: baseResponseSchema(
						Type.Array(Type.Object(dbSchemaTypes.k8sPods)),
					),
					404: errorResponseSchema,
					400: errorResponseSchema,
				},
			},
		),
	);
