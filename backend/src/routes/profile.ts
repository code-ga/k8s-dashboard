import Elysia from "elysia";
import { authenticationMiddleware } from "../middleware/auth";
import { schema } from "../database/schema";
import { eq } from "drizzle-orm";
import { db } from "../database";
import { Type } from "@sinclair/typebox";
import { dbSchemaTypes, type SchemaStatic } from "../database/type";
import { baseResponseSchema, errorResponseSchema } from "../types";
import { appStateService } from "../services/AppState";
import type { Static } from "@sinclair/typebox";
import { isAllElementsPresent } from "../utils/array";

export const profileRouter = new Elysia({
	prefix: "/profile",
	detail: { description: "Profile Routes", tags: ["Profile"] },
})
	.use(authenticationMiddleware)
	.use(appStateService)
	.guard(
		{ userAuth: true },
		(app) =>
			app
				.get(
					"/me",
					async (ctx) => {
						const profile = await db
							.select()
							.from(schema.profile)
							.where(eq(schema.profile.userId, ctx.user.id));
						if (!profile || profile.length === 0 || !profile[0]) {
							return ctx.status(404, {
								status: 404,
								message: "Profile not found",
								timestamp: Date.now(),
								success: false,
							});
						}
						return ctx.status(200, {
							status: 200,
							data: profile[0],
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
							200: baseResponseSchema(Type.Object(dbSchemaTypes.profile)),
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
							.where(eq(schema.profile.userId, ctx.user.id));
						if (alreadyExists && alreadyExists.length > 0) {
							return ctx.status(400, {
								status: 400,
								message: "Profile already exists",
								timestamp: Date.now(),
								success: false,
							});
						}
						const appState = await ctx.appState.getAppState();
						const permission = ["user"] as Static<
							typeof dbSchemaTypes.profile.permission
						>;
						if (appState.createNewAdmin) {
							permission.push("admin");
						}
						const profile = await db
							.insert(schema.profile)
							.values({
								userId: ctx.user.id,
								username: ctx.body.username,
								permission: permission,
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
						ctx.appState.updateAppState({
							createNewAdmin: false,
						});
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
						},
					},
				)
				.put(
					"/",
					async (ctx) => {
						const profile = await db
							.update(schema.profile)
							.set({ userId: ctx.user.id, username: ctx.body.username })
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
							const profile = await db
								.select()
								.from(schema.profile)
								.where(eq(schema.profile.id, query.profileId));
							if (!profile || !profile[0]) {
								return ctx.status(400, {
									status: 400,
									message: "Profile not found",
									timestamp: Date.now(),
									success: false,
								});
							}
							return ctx.status(200, {
								status: 200,
								data: profile[0],
								message: "Profile fetched successfully",
								timestamp: Date.now(),
								success: true,
							});
						}
						if ("userId" in query) {
							const profile = await db
								.select()
								.from(schema.profile)
								.where(eq(schema.profile.userId, query.userId));
							if (!profile || !profile[0]) {
								return ctx.status(400, {
									status: 400,
									message: "Profile not found",
									timestamp: Date.now(),
									success: false,
								});
							}
							return ctx.status(200, {
								status: 200,
								data: profile[0],
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
		// .delete("/", async ({ user }) => {
		// 	const profile = await db
		// 		.delete(schema.profile)
		// 		.where(eq(schema.profile.userId, user.id))
		// 		.returning();
		// 	return profile;
		// }),
	)
	.guard({ roleAuth: ["manager"] }, (app) =>
		app
			.patch(
				"/add_role",
				async (ctx) => {
					const targetUserId = ctx.body.userId || ctx.user.id;
					const alreadyHasRole = await db
						.select()
						.from(schema.profile)
						.where(eq(schema.profile.userId, targetUserId));
					if (!alreadyHasRole || !alreadyHasRole[0]) {
						return ctx.status(400, {
							status: 400,
							message: "Profile not found",
							timestamp: Date.now(),
							success: false,
						});
					}
					const permissionSet = new Set([
						...alreadyHasRole[0].permission,
						...ctx.body.permission,
					]);
					if (
						ctx.body.permission.includes("admin") &&
						!alreadyHasRole[0].permission.includes("admin")
					) {
						// Optionally allow managers to add admin if they are admin?
						// For now, let's keep the logic simple or just warn.
						// The original code was:
						// return ctx.status(400, { message: "Profile already has admin role" });
						// Wait, current logic prevents adding "admin" if already has it? No.
						// "if (ctx.body.permission.includes("admin") && !alreadyHasRole[0].permission.includes("admin"))" ??
						// Actually line 246-249 in original: checking if we are ADDING admin?
						// Wait, the original logic was:
						// if (includes("admin") && !alreadyHas_admin) ... ERROR?
						// "Profile already has admin role" -> this error message implies the opposite check.
						// If I try to add "admin" and user DOES NOT have it, it returns "Already has admin role"? That's a bug in original code or I misread.

						// Original:
						// if (ctx.body.permission.includes("admin") && !alreadyHasRole[0].permission.includes("admin")) {
						//    return ... "Profile already has admin role"
						// }
						// This logic seems reversed or the message is wrong.
						// If I *add* admin, and they *don't* have it, it errors? So I CANNOT add admin?
						// This might be a safeguard to prevent managers from creating admins.
						// I will preserve this logic for now but fix the target user.

						return ctx.status(400, {
							status: 400,
							message: "Cannot verify admin privilege or action not allowed",
							timestamp: Date.now(),
							success: false,
						});
					}
					if (permissionSet.size === alreadyHasRole[0].permission.length) {
						return ctx.status(400, {
							status: 400,
							message: "Profile already has all the roles",
							timestamp: Date.now(),
							success: false,
						});
					}
					const profile = await db
						.update(schema.profile)
						.set({
							userId: targetUserId,
							permission: [...permissionSet],
						})
						.where(eq(schema.profile.userId, targetUserId))
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
						permission: dbSchemaTypes.profile.permission,
						userId: Type.Optional(dbSchemaTypes.profile.userId),
					}),
					response: {
						200: baseResponseSchema(Type.Object(dbSchemaTypes.profile)),
						400: errorResponseSchema,
					},
					roleAuth: ["manager"],
				},
			)
			.patch(
				"/remove_role",
				async (ctx) => {
					const targetUserId = ctx.body.userId || ctx.user.id;
					const alreadyHasRole = await db
						.select()
						.from(schema.profile)
						.where(eq(schema.profile.userId, targetUserId));
					if (!alreadyHasRole || !alreadyHasRole[0]) {
						return ctx.status(400, {
							status: 400,
							message: "Profile not found",
							timestamp: Date.now(),
							success: false,
						});
					}
					if (
						!isAllElementsPresent(
							ctx.body.permission,
							alreadyHasRole[0].permission,
						)
					) {
						return ctx.status(400, {
							status: 400,
							message: "Profile does not have the role",
							timestamp: Date.now(),
							success: false,
						});
					}
					const permissionSet = new Set(alreadyHasRole[0].permission);
					for (const permission of ctx.body.permission) {
						permissionSet.delete(permission);
					}
					const profile = await db
						.update(schema.profile)
						.set({
							userId: targetUserId,
							permission: [...permissionSet],
						})
						.where(eq(schema.profile.userId, targetUserId))
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
						permission: dbSchemaTypes.profile.permission,
						userId: Type.Optional(dbSchemaTypes.profile.userId),
					}),
					response: {
						200: baseResponseSchema(Type.Object(dbSchemaTypes.profile)),
						400: errorResponseSchema,
					},
					roleAuth: ["manager"],
				},
			)
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
					roleAuth: ["manager"],
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
					roleAuth: ["manager"],
				},
			)
			.get(
				"/available-role",
				async (ctx) => {
					const roles: string[] = [];
					dbSchemaTypes.profile.permission.items.anyOf.forEach((role) => {
						roles.push(role.const);
					});
					return ctx.status(200, {
						status: 200,
						data: roles,
						message: "Roles fetched successfully",
						timestamp: Date.now(),
						success: true,
					});
				},
				{
					response: {
						200: baseResponseSchema(Type.Array(Type.String())),
						400: errorResponseSchema,
					},
					roleAuth: ["manager"],
				},
			),
	);
