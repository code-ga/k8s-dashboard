export type ResourceKey =
	| "cluster"
	| "node"
	| "pod"
	| "deployment"
	| "service"
	| "ingress"
	| "configmap"
	| "secret"
	| "pvc"
	| "user"
	| "role";

export type Action = "read" | "create" | "update" | "delete" | "manage";

export type Permission = `${ResourceKey}:${Action}`;

export type PermissionFilter =
	| Permission
	| { _op: "and"; filters: PermissionFilter[] }
	| { _op: "or"; filters: PermissionFilter[] }
	| { _op: "not"; filter: PermissionFilter };

export function evaluatePermissionFilter(
	userPerms: Set<Permission>,
	filter: PermissionFilter,
): boolean {
	if (typeof filter === "string") return userPerms.has(filter);
	if (filter._op === "and")
		return filter.filters.every((f) => evaluatePermissionFilter(userPerms, f));
	if (filter._op === "or")
		return filter.filters.some((f) => evaluatePermissionFilter(userPerms, f));
	if (filter._op === "not")
		return !evaluatePermissionFilter(userPerms, filter.filter);
	return false;
}
