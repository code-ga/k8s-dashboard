import { Type } from "@sinclair/typebox";
import { eq, inArray } from "drizzle-orm";
import { Elysia } from "elysia";
import {
	type Permission,
	PermissionGroupSchema,
	getPermissionsGrouped,
} from "../constants/permissions";
import { db } from "../database";
import { schema } from "../database/schema";
import { dbSchemaTypes } from "../database/type";
import { authenticationMiddleware } from "../middleware/auth";
import { agentManagerService } from "../services/agentManager";
import { baseResponseSchema, errorResponseSchema } from "../types";
import {
	addRolesToProfile,
	getAvailableRoles,
	removeRolesFromProfile,
} from "../utils/role";

export const roleRoute = new Elysia({ prefix: "/role" })
	.use(authenticationMiddleware)
	.use(agentManagerService)
	.guard(
		{
			userAuth: {
				requiredProfile: true,
			},
		},
		(app) =>
			app
				.get(
					"/",
					async (ctx) => {
						const clusters = await db.select().from(schema.role);
						return ctx.status(200, {
							success: true,
							message: "Role fetched successfully",
							data: clusters,
							timestamp: Date.now(),
						});
					},
					{
						roleAuth: "role:read",
						response: {
							200: baseResponseSchema(
								Type.Array(Type.Object(dbSchemaTypes.role)),
							),
							500: errorResponseSchema,
						},
					},
				)
				.post(
					"/",
					async (ctx) => {
						const { name, description, permissions } = ctx.body;
						for (const perm of permissions) {
							// validate permission format
							if (!/^[a-z]+:[a-z]+$/.test(perm)) {
								return ctx.status(400, {
									success: false,
									message: `Invalid permission format: ${perm}`,
									timestamp: Date.now(),
								});
							}
							// validate permission exists
							const [resource, action] = perm.split(":");
							if (!resource || !action) {
								return ctx.status(400, {
									success: false,
									message: `Invalid permission format: ${perm}`,
									timestamp: Date.now(),
								});
							}
							const resourcePermissions = getPermissionsGrouped().find(
								(pg) => pg.resource === resource,
							);
							if (
								!resourcePermissions ||
								!resourcePermissions.permissions.find(
									(p) => p.action === action,
								)
							) {
								return ctx.status(400, {
									success: false,
									message: `Invalid permission: ${perm}`,
									timestamp: Date.now(),
								});
							}
							// check does permission have in both user permissions and predefined permissions
							const userRequestedPermission = ctx.userPermissions.has(
								perm as Permission,
							);
							if (!userRequestedPermission) {
								return ctx.status(403, {
									success: false,
									message: `You don't have permission: ${perm}`,
									timestamp: Date.now(),
								});
							}
						}
						if (permissions.length === 0) {
							return ctx.status(400, {
								success: false,
								message: "Permissions cannot be empty",
								timestamp: Date.now(),
							});
						}
						const role = await db
							.insert(schema.role)
							.values({
								name,
								description,
								permissions,
							})
							.returning();
						if (role.length === 0 || !role[0]) {
							return ctx.status(500, {
								success: false,
								message: "Failed to create role",
								timestamp: Date.now(),
							});
						}
						return ctx.status(200, {
							success: true,
							message: "Role created successfully",
							data: role[0],
							timestamp: Date.now(),
						});
					},
					{
						roleAuth: "role:create",
						response: {
							200: baseResponseSchema(Type.Object(dbSchemaTypes.role)),
							500: errorResponseSchema,
							400: errorResponseSchema,
							403: errorResponseSchema,
						},
						body: Type.Object({
							name: dbSchemaTypes.role.name,
							description: dbSchemaTypes.role.description,
							permissions: dbSchemaTypes.role.permissions,
						}),
					},
				)
				.delete(
					"/:id",
					async (ctx) => {
						const { id } = ctx.params;
						const role = await db
							.delete(schema.role)
							.where(eq(schema.role.id, id))
							.returning();
						if (role.length === 0 || !role[0]) {
							return ctx.status(500, {
								success: false,
								message: "Failed to delete role",
								timestamp: Date.now(),
							});
						}
						return ctx.status(200, {
							success: true,
							message: "Role deleted successfully",
							data: role[0],
							timestamp: Date.now(),
						});
					},
					{
						roleAuth: "role:delete",
						response: {
							200: baseResponseSchema(Type.Object(dbSchemaTypes.role)),
							500: errorResponseSchema,
						},
						params: Type.Object({
							id: dbSchemaTypes.role.id,
						}),
					},
				)
				.patch(
					"/:id",
					async (ctx) => {
						const { id } = ctx.params;
						const { name, description, permissions } = ctx.body;
						if (permissions) {
							for (const perm of permissions) {
								// validate permission format
								if (!/^[a-z]+:[a-z]+$/.test(perm)) {
									return ctx.status(400, {
										success: false,
										message: `Invalid permission format: ${perm}`,
										timestamp: Date.now(),
									});
								}
								// validate permission exists
								const [resource, action] = perm.split(":");
								if (!resource || !action) {
									return ctx.status(400, {
										success: false,
										message: `Invalid permission format: ${perm}`,
										timestamp: Date.now(),
									});
								}
								const resourcePermissions = getPermissionsGrouped().find(
									(pg) => pg.resource === resource,
								);
								if (
									!resourcePermissions ||
									!resourcePermissions.permissions.find(
										(p) => p.action === action,
									)
								) {
									return ctx.status(400, {
										success: false,
										message: `Invalid permission: ${perm}`,
										timestamp: Date.now(),
									});
								}
								// check does permission have in both user permissions and predefined permissions
								const userRequestedPermission = ctx.userPermissions.has(
									perm as Permission,
								);
								if (!userRequestedPermission) {
									return ctx.status(403, {
										success: false,
										message: `You don't have permission: ${perm}`,
										timestamp: Date.now(),
									});
								}
							}
							if (permissions.length === 0) {
								return ctx.status(400, {
									success: false,
									message: "Permissions cannot be empty",
									timestamp: Date.now(),
								});
							}
						}
						const role = await db
							.update(schema.role)
							.set({
								name,
								description,
								permissions,
							})
							.where(eq(schema.role.id, id))
							.returning();
						if (role.length === 0 || !role[0]) {
							return ctx.status(404, {
								success: false,
								message: "Role not found",
								timestamp: Date.now(),
							});
						}
						return ctx.status(200, {
							success: true,
							message: "Role updated successfully",
							data: role[0],
							timestamp: Date.now(),
						});
					},
					{
						roleAuth: "role:update",
						response: {
							200: baseResponseSchema(Type.Object(dbSchemaTypes.role)),
							404: errorResponseSchema,
							400: errorResponseSchema,
							403: errorResponseSchema,
						},
						params: Type.Object({
							id: dbSchemaTypes.role.id,
						}),
						body: Type.Partial(
							Type.Object({
								name: dbSchemaTypes.role.name,
								description: dbSchemaTypes.role.description,
								permissions: dbSchemaTypes.role.permissions,
							}),
						),
					},
				)
				.get(
					"/:id",
					async (ctx) => {
						const { id } = ctx.params;
						const role = await db
							.select()
							.from(schema.role)
							.where(eq(schema.role.id, id));
						if (role.length === 0 || !role[0]) {
							return ctx.status(404, {
								success: false,
								message: "Role not found",
								timestamp: Date.now(),
							});
						}
						return ctx.status(200, {
							success: true,
							message: "Role fetched successfully",
							data: role[0],
							timestamp: Date.now(),
						});
					},
					{
						roleAuth: "role:read",
						response: {
							200: baseResponseSchema(Type.Object(dbSchemaTypes.role)),
							404: errorResponseSchema,
						},
						params: Type.Object({
							id: dbSchemaTypes.role.id,
						}),
					},
				)
				// request using query like ?ids=18bd6527-137d-477c-b9ff-998495033c7b&ids=23bb660e-4069-42d6-9582-1cbe1933798d
				.get(
					"/many",
					async (ctx) => {
						const { ids } = ctx.query;
						const roles = await db
							.select()
							.from(schema.role)
							.where(inArray(schema.role.id, ids));
						if (roles.length === 0) {
							return ctx.status(404, {
								success: false,
								message: "Roles not found",
								timestamp: Date.now(),
							});
						}
						return ctx.status(200, {
							success: true,
							message: "Roles fetched successfully",
							data: roles,
							timestamp: Date.now(),
						});
					},
					{
						roleAuth: "role:read",
						response: {
							200: baseResponseSchema(
								Type.Array(Type.Object(dbSchemaTypes.role)),
							),
							404: errorResponseSchema,
						},
						query: Type.Object({
							ids: Type.Array(dbSchemaTypes.role.id),
						}),
					},
				)
				.get(
					"/all-permissions",
					async (ctx) => {
						const permissions = getPermissionsGrouped();
						return ctx.status(200, {
							success: true,
							message: "Permissions fetched successfully",

							data: permissions,
							timestamp: Date.now(),
						});
					},
					{
						roleAuth: "role:read",
						response: {
							200: baseResponseSchema(Type.Array(PermissionGroupSchema)),
							404: errorResponseSchema,
						},
					},
				)
				.patch(
					"/:id/set-default",
					async (ctx) => {
						const { id } = ctx.params;
						const { isDefault } = ctx.body;

						// Guard: never remove the last default role
						if (!isDefault) {
							const defaultCount = await db.$count(
								schema.role,
								eq(schema.role.isDefault, true),
							);
							if (defaultCount <= 1)
								return ctx.status(400, {
									success: false,
									message: "At least one default role is required",
									timestamp: Date.now(),
								});
						}

						const result = await db
							.update(schema.role)
							.set({ isDefault, updatedAt: new Date() })
							.where(eq(schema.role.id, id))
							.returning();

						if (result.length === 0 || !result[0]) {
							return ctx.status(404, {
								success: false,
								message: "Role not found",
								timestamp: Date.now(),
							});
						}

						return ctx.status(200, {
							success: true,
							message: "Role updated successfully",
							data: result[0],
							timestamp: Date.now(),
						});
					},
					{
						roleAuth: "role:update",
						response: {
							200: baseResponseSchema(Type.Object(dbSchemaTypes.role)),
							404: errorResponseSchema,
							400: errorResponseSchema,
						},
						params: Type.Object({
							id: dbSchemaTypes.role.id,
						}),
						body: Type.Object({
							isDefault: dbSchemaTypes.role.isDefault,
						}),
					},
				)
				.patch(
					"/assign-to-user",
					async (ctx) => {
						const targetUserId = ctx.body.userId || ctx.user.id;
						const result = await addRolesToProfile(
							targetUserId,
							ctx.body.roleIds,
						);

						if (!result.success) {
							return ctx.status(400, {
								success: false,
								message: result.message || "Failed to assign roles",
								timestamp: Date.now(),
							});
						}

						return ctx.status(200, {
							success: true,
							message: "Roles assigned successfully",
							data: result.data!,
							timestamp: Date.now(),
						});
					},
					{
						roleAuth: "user:manage",
						body: Type.Object({
							roleIds: Type.Array(Type.String()),
							userId: Type.Optional(dbSchemaTypes.profile.userId),
						}),
						response: {
							200: baseResponseSchema(Type.Object(dbSchemaTypes.profile)),
							400: errorResponseSchema,
						},
					},
				)
				.patch(
					"/remove-from-user",
					async (ctx) => {
						const targetUserId = ctx.body.userId || ctx.user.id;
						const result = await removeRolesFromProfile(
							targetUserId,
							ctx.body.roleIds,
						);

						if (!result.success) {
							return ctx.status(400, {
								success: false,
								message: result.message || "Failed to remove roles",
								timestamp: Date.now(),
							});
						}

						return ctx.status(200, {
							success: true,
							message: "Roles removed successfully",
							data: result.data!,
							timestamp: Date.now(),
						});
					},
					{
						roleAuth: "user:manage",
						body: Type.Object({
							roleIds: Type.Array(Type.String()),
							userId: Type.Optional(dbSchemaTypes.profile.userId),
						}),
						response: {
							200: baseResponseSchema(Type.Object(dbSchemaTypes.profile)),
							400: errorResponseSchema,
						},
					},
				)
				.get(
					"/available",
					async (ctx) => {
						const roles = await getAvailableRoles();
						return ctx.status(200, {
							success: true,
							message: "Available roles fetched successfully",
							data: roles,
							timestamp: Date.now(),
						});
					},
					{
						roleAuth: "role:read",
						response: {
							200: baseResponseSchema(
								Type.Array(Type.Object(dbSchemaTypes.role)),
							),
							500: errorResponseSchema,
						},
					},
				),
	);
