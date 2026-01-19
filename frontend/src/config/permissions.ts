export type Role = "user" | "manager" | "admin";

export type Resource = "cluster" | "nodes" | "pods" | "users" | "settings";

export type Action = "view" | "create" | "update" | "delete" | "manage";

type Permissions = {
	[key in Role]: {
		[key in Resource]?: Action[];
	};
};

export const PERMISSIONS: Permissions = {
	user: {
		cluster: ["view"],
		pods: ["view"],
		settings: ["view", "update"],
	},
	manager: {
		cluster: ["view", "create", "update", "delete"],
		nodes: ["view", "update", "delete"],
		pods: ["view", "delete"],
		settings: ["view", "update"],
		users: ["view"],
	},
	admin: {
		cluster: ["view", "create", "update", "delete"],
		nodes: ["view", "update", "delete"],
		pods: ["view", "delete"],
		settings: ["view", "update"],
		users: ["view", "create", "update", "delete", "manage"],
	},
};

export const hasPermission = (
	role: Role,
	resource: Resource,
	action: Action,
): boolean => {
	const rolePermissions = PERMISSIONS[role];
	if (!rolePermissions) return false;

	const resourcePermissions = rolePermissions[resource];
	if (!resourcePermissions) return false;

	return resourcePermissions.includes(action);
};
