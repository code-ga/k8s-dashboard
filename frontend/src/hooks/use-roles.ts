import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export const fetchRole = async (id: string) => {
	const res = await api.api.role({ id }).get();
	if (res.error) throw res.error;
	if (!res.data.data) throw new Error(res.data.message || "Failed to fetch role");
	return res.data.data;
};

export const fetchRoles = async (ids: string[]) => {
	if (!ids || ids.length === 0) return [];
	const res = await api.api.role.many.get({
		query: {
			ids,
		},
	});
	if (res.error) throw res.error;
	if (!res.data.data) throw new Error(res.data.message || "Failed to fetch roles");
	return res.data.data;
};

export const useRole = (roleId?: string) => {
	return useQuery({
		queryKey: ["role", roleId],
		queryFn: () => fetchRole(roleId!),
		enabled: !!roleId,
		staleTime: 1000 * 60 * 5, // 5 minutes cache
	});
};

export const useRoles = (roleIds?: string[]) => {
	return useQuery({
		queryKey: ["roles", roleIds],
		queryFn: () => fetchRoles(roleIds!),
		enabled: !!roleIds && roleIds.length > 0,
		staleTime: 1000 * 60 * 5, // 5 minutes cache
	});
};
