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
			if (res.error) {
				const errorValue = res.error.value;
				const message =
					typeof errorValue === "object" &&
					errorValue !== null &&
					"message" in errorValue
						? (errorValue as { message: string }).message
						: String(errorValue);
				throw new Error(message);
			}
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
