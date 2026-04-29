import type { ResourceKey as Resource, Action } from "@/lib/permission-matcher";

export type { Resource, Action };
export type Role = string; // Now dynamic role IDs (UUIDs or names)

// Legacy hasPermission is deprecated. Use usePermissions hook instead.
/** @deprecated Use usePermissions hook and evaluatePermissionFilter */
export const hasPermission = (
	_role: Role,
	_resource: Resource,
	_action: Action,
): boolean => {
	// This is no longer used but kept for type compatibility during migration
	return true;
};
