import { Type } from "@sinclair/typebox";
import { eq, sql } from "drizzle-orm";
import Elysia from "elysia";
import { db } from "../database";
import { schema } from "../database/schema";
import { dbSchemaTypes, type SchemaStatic } from "../database/type";
import { authenticationMiddleware } from "../middleware/auth";
import { appStateService } from "../services/AppState";
import { baseResponseSchema, errorResponseSchema } from "../types";
import { resolveUserPermissions } from "../constants/permissions";
import { getInitialRoleIds } from "../utils/role";

export const profileRouter = new Elysia({
	prefix: "/profile",
	detail: { description: "Profile Routes", tags: ["Profile"] },
})
	.use(authenticationMiddleware)
	.use(appStateService)
	.guard(
		{
			userAuth: {
				requiredProfile: false,
			},
		},
		(app) =>
			app
				.get(
					"/me",
					async (ctx) => {
						const profiles = await db.query.profile.findFirst({
							where: {
								userId: ctx.user.id,
							},
						});
						const profile = profiles;
						if (!profile) {
							return ctx.status(404, {
								status: 404,
								message: "Profile not found",
								timestamp: Date.now(),
								success: false,
							});
						}
						return ctx.status(200, {
							status: 200,
							data: profile,
							message: "Profile fetched successfully",
							timestamp: Date.now(),
							success: true,
						});
					},
					{
						detail: {
							description: "Get Profile",
						},
						response: {
							200: baseResponseSchema(
								Type.Object({ ...dbSchemaTypes.profile }),
							),
							404: errorResponseSchema,
						},
					},
				)
				.get(
					"/my-permissions",
					async (ctx) => {
						const profiles = await db
							.select()
							.from(schema.profile)
							.where(eq(schema.profile.userId, ctx.user.id))
							.limit(1);
						const profile = profiles[0];
						if (!profile) {
							return ctx.status(404, {
								status: 404,
								message: "Profile not found",
								timestamp: Date.now(),
								success: false,
							});
						}
						const userPermissions = await resolveUserPermissions(
							profile.rolesIDs,
						);
						return ctx.status(200, {
							status: 200,
							data: Array.from(userPermissions),
							message: "Permissions fetched successfully",
							timestamp: Date.now(),
							success: true,
						});
					},
					{
						detail: {
							description: "Get Current User Permissions",
						},
						response: {
							200: baseResponseSchema(Type.Array(Type.String())),
							404: errorResponseSchema,
						},
					},
				)
				.post(
					"/",
					async (ctx) => {
						const alreadyExists = await db
							.select()
							.from(schema.profile)
							.where(eq(schema.profile.userId, ctx.user.id))
							.limit(1);
						if (alreadyExists.length > 0) {
							return ctx.status(400, {
								status: 400,
								message: "Profile already exists",
								timestamp: Date.now(),
								success: false,
							});
						}
						const appState = await ctx.appState.getAppState();
						const roleIds = await getInitialRoleIds(appState.createNewAdmin);
						const profile = await db
							.insert(schema.profile)
							.values({
								userId: ctx.user.id,
								username: ctx.body.username,
								rolesIDs: roleIds,
								isSystemDefault: appState.createNewAdmin,
							})
							.returning();
						if (!profile || !profile[0]) {
							return ctx.status(400, {
								status: 400,
								message: "Profile not created",
								timestamp: Date.now(),
								success: false,
							});
						}
						if (appState.createNewAdmin) {
							await ctx.appState.updateAppState({
								createNewAdmin: false,
							});
						}
						return ctx.status(201, {
							status: 201,
							data: profile[0],
							message: "Profile created successfully",
							timestamp: Date.now(),
							success: true,
						});
					},
					{
						body: Type.Object({
							username: dbSchemaTypes.profile.username,
						}),
						response: {
							201: baseResponseSchema(Type.Object(dbSchemaTypes.profile)),
							400: errorResponseSchema,
							500: errorResponseSchema,
						},
					},
				)
				.put(
					"/",
					async (ctx) => {
						const profile = await db
							.update(schema.profile)
							.set({
								userId: ctx.user.id,
								username: ctx.body.username,
								updatedAt: new Date(),
							})
							.where(eq(schema.profile.userId, ctx.user.id))
							.returning();
						if (!profile || !profile[0]) {
							return ctx.status(400, {
								status: 400,
								message: "Profile not updated",
								timestamp: Date.now(),
								success: false,
							});
						}
						return ctx.status(200, {
							status: 200,
							data: profile[0],
							message: "Profile updated successfully",
							timestamp: Date.now(),
							success: true,
						});
					},
					{
						body: Type.Object({
							username: dbSchemaTypes.profile.username,
						}),
						response: {
							200: baseResponseSchema(Type.Object(dbSchemaTypes.profile)),
							400: errorResponseSchema,
						},
					},
				)
				.get(
					"/",
					async (ctx) => {
						const query = ctx.query;
						if ("profileId" in query) {
							const profiles = await db
								.select()
								.from(schema.profile)
								.where(eq(schema.profile.id, query.profileId))
								.limit(1);
							const profile = profiles[0];
							if (!profile) {
								return ctx.status(400, {
									status: 400,
									message: "Profile not found",
									timestamp: Date.now(),
									success: false,
								});
							}
							return ctx.status(200, {
								status: 200,
								data: profile,
								message: "Profile fetched successfully",
								timestamp: Date.now(),
								success: true,
							});
						}
						if ("userId" in query) {
							const profiles = await db
								.select()
								.from(schema.profile)
								.where(eq(schema.profile.userId, query.userId))
								.limit(1);
							const profile = profiles[0];
							if (!profile) {
								return ctx.status(400, {
									status: 400,
									message: "Profile not found",
									timestamp: Date.now(),
									success: false,
								});
							}
							return ctx.status(200, {
								status: 200,
								data: profile,
								message: "Profile fetched successfully",
								timestamp: Date.now(),
								success: true,
							});
						}
						return ctx.status(400, {
							status: 400,
							message: "Invalid query parameters",
							timestamp: Date.now(),
							success: false,
						});
					},
					{
						query: Type.Union([
							Type.Object({
								profileId: dbSchemaTypes.profile.id,
							}),
							Type.Object({
								userId: dbSchemaTypes.profile.userId,
							}),
						]),
						response: {
							200: baseResponseSchema(Type.Object(dbSchemaTypes.profile)),
							400: errorResponseSchema,
						},
					},
				),
	)
	.guard({ userAuth: { requiredProfile: true } }, (app) =>
		app
			.get(
				"/list-user",
				async (ctx) => {
					const profiles = await db.select().from(schema.profile);
					return ctx.status(200, {
						status: 200,
						data: profiles,
						message: "Profiles fetched successfully",
						timestamp: Date.now(),
						success: true,
					});
				},
				{
					response: {
						200: baseResponseSchema(
							Type.Array(Type.Object(dbSchemaTypes.profile)),
						),
						400: errorResponseSchema,
					},
					roleAuth: "user:read",
				},
			)
			.get(
				"/search_user",
				async (ctx) => {
					const query = ctx.query;
					const profiles: SchemaStatic<typeof dbSchemaTypes.profile>[] = [];
					if (query.type === "username") {
						profiles.push(
							...(await db
								.select()
								.from(schema.profile)
								.where(eq(schema.profile.username, query.username))),
						);
					}
					if (query.type === "userId") {
						profiles.push(
							...(await db
								.select()
								.from(schema.profile)
								.where(eq(schema.profile.userId, query.userId))),
						);
					}
					return ctx.status(200, {
						status: 200,
						data: profiles,
						message: "Profiles fetched successfully",
						timestamp: Date.now(),
						success: true,
					});
				},
				{
					query: Type.Union([
						Type.Object({
							type: Type.Literal("username"),
							username: dbSchemaTypes.profile.username,
						}),
						Type.Object({
							type: Type.Literal("userId"),
							userId: dbSchemaTypes.profile.userId,
						}),
					]),
					response: {
						200: baseResponseSchema(
							Type.Array(Type.Object(dbSchemaTypes.profile)),
						),
						400: errorResponseSchema,
					},
					roleAuth: "user:read",
				},
			),
	);
