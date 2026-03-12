import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
	type Permission,
	type PermissionFilter,
	evaluatePermissionFilter,
} from "@/lib/permission-matcher";
import { useMemo } from "react";

export function usePermissions() {
	const { data, isLoading, error } = useQuery({
		queryKey: ["my-permissions"],
		queryFn: async () => {
			const res = await api.api.profile["my-permissions"].get();
			if (res.error) throw new Error(res.error.value.message);
			return new Set(res.data.data as Permission[]);
		},
		staleTime: 5 * 60 * 1000, // 5 minutes
	});

	const can = useMemo(() => {
		return (filter: PermissionFilter) => {
			if (!data) return false;
			return evaluatePermissionFilter(data, filter);
		};
	}, [data]);

	return {
		permissions: data,
		isLoading,
		error,
		can,
	};
}
