import { eq } from "drizzle-orm";
import { getPermissionsGrouped } from "../constants/permissions";
import { db } from "../database";
import { schema } from "../database/schema";
import { isAllElementsPresent } from "./array";

export const generateSeedRoles = async () => {
	const existingRoles = await db.select().from(schema.role);
	if (existingRoles.length > 0) {
		console.log("Roles already exist, skipping seeding.");
		return;
	}
	const permissions = getPermissionsGrouped();
	const allPermissions = permissions.flatMap((group) =>
		group.permissions.map((perm) => perm.id),
	);
	const adminRole = {
		name: "Admin",
		description: "Full access to all resources and actions.",
		permissions: allPermissions,
		isDefault: false,
		adminRole: true,
	};
	const viewerRole = {
		name: "Viewer",
		description: "Read-only access to all resources.",
		permissions: allPermissions.filter((perm) => perm.endsWith(":read")),
		isDefault: true,
		adminRole: false,
	};
	await db.insert(schema.role).values([adminRole, viewerRole]);
	console.log("Seeded default roles: Admin and Viewer.");
};

export const getInitialRoleIds = async (createNewAdmin: boolean) => {
	const roleIds: string[] = [];
	if (createNewAdmin) {
		const adminRoles = await db
			.select()
			.from(schema.role)
			.where(eq(schema.role.adminRole, true))
			.limit(1);
		const adminRole = adminRoles[0];
		if (adminRole) {
			roleIds.push(adminRole.id);
		}
	}

	const defaultRoles = await db
		.select()
		.from(schema.role)
		.where(eq(schema.role.isDefault, true));

	if (defaultRoles.length > 0) {
		roleIds.push(...defaultRoles.map((role) => role.id));
	}

	return [...new Set(roleIds)];
};

export const addRolesToProfile = async (
	targetUserId: string,
	roleIdsToAdd: string[],
) => {
	const profiles = await db
		.select()
		.from(schema.profile)
		.where(eq(schema.profile.userId, targetUserId))
		.limit(1);

	const profile = profiles[0];

	if (!profile) {
		throw new Error("Profile not found");
	}

	const currentRoleIds = profile.rolesIDs || [];
	const newRoleIds = [...new Set([...currentRoleIds, ...roleIdsToAdd])];

	if (newRoleIds.length === currentRoleIds.length) {
		return {
			success: false,
			message: "Profile already has these roles",
			data: profile,
		};
	}

	const updatedProfile = await db
		.update(schema.profile)
		.set({
			rolesIDs: newRoleIds,
			updatedAt: new Date(),
		})
		.where(eq(schema.profile.userId, targetUserId))
		.returning();

	if (!updatedProfile[0]) {
		throw new Error("Failed to update profile");
	}

	return { success: true, data: updatedProfile[0] };
};

export const removeRolesFromProfile = async (
	targetUserId: string,
	roleIdsToRemove: string[],
) => {
	const profiles = await db
		.select()
		.from(schema.profile)
		.where(eq(schema.profile.userId, targetUserId))
		.limit(1);

	const profile = profiles[0];

	if (!profile) {
		throw new Error("Profile not found");
	}

	const currentRoleIds = profile.rolesIDs || [];

	if (!isAllElementsPresent(roleIdsToRemove, currentRoleIds)) {
		return {
			success: false,
			message: "Profile does not have some of these roles",
			data: profile,
		};
	}

	const newRoleIds = currentRoleIds.filter(
		(id) => !roleIdsToRemove.includes(id),
	);

	const updatedProfile = await db
		.update(schema.profile)
		.set({
			rolesIDs: newRoleIds,
			updatedAt: new Date(),
		})
		.where(eq(schema.profile.userId, targetUserId))
		.returning();

	if (!updatedProfile[0]) {
		throw new Error("Failed to update profile");
	}

	return { success: true, data: updatedProfile[0] };
};

export const getAvailableRoles = async () => {
	return await db.select().from(schema.role);
};
