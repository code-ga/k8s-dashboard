import type { TFullPod } from "@k8s-dashboard/backend/src/types";
import {
	type UseMutationOptions,
	type UseQueryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { podApi } from "@/api/pod";
import { usePermissions } from "@/hooks/use-permissions";
import type { databaseTypes, SchemaStatic } from "@/lib/api";

type Pod = SchemaStatic<databaseTypes.databaseTypes["k8sPods"]>;

export function usePods(
	clusterId: number,
	options?: Partial<UseQueryOptions<Pod[], Error>>,
) {
	const { can } = usePermissions();

	return useQuery({
		queryKey: ["pods", clusterId],
		queryFn: () => podApi.list(clusterId),
		enabled: can("pod:read") && !!clusterId,
		...options,
	});
}

export function useAllPods(
	clusterId: number,
	options?: Partial<UseQueryOptions<Pod[], Error>>,
) {
	return useQuery({
		queryKey: ["pods", clusterId, "all"],
		queryFn: () => podApi.listAll(clusterId),
		enabled: !!clusterId,
		...options,
	});
}

export function usePod(
	clusterId: number,
	podId: number,
	options?: Partial<UseQueryOptions<TFullPod, Error>>,
) {
	const { can } = usePermissions();

	return useQuery({
		queryKey: ["pod", clusterId, podId],
		queryFn: () => podApi.get(clusterId, podId),
		enabled: can("pod:read") && !!clusterId && !!podId,
		...options,
	});
}

export function usePodDescribe(
	clusterId: number,
	podId: number,
	options?: Partial<UseQueryOptions<any, Error>>,
) {
	return useQuery({
		queryKey: ["pod-describe", clusterId, podId],
		queryFn: () => podApi.describe(clusterId, podId),
		enabled: !!clusterId && !!podId,
		refetchInterval: 5000,
		...options,
	});
}

type UpdatePodParams = {
	clusterId: number;
	podId: number;
	data: Record<string, any>;
};

export function useUpdatePod(
	options?: Partial<UseMutationOptions<any, Error, UpdatePodParams>>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ clusterId, podId, data }) =>
			podApi.update(clusterId, podId, data),
		onSuccess: (...args) => {
			queryClient.invalidateQueries({ queryKey: ["pods"] });
			queryClient.invalidateQueries({ queryKey: ["pod"] });
			options?.onSuccess?.(...args);
		},
		...options,
	});
}

type DeletePodParams = {
	clusterId: number;
	podId: number;
};

export function useDeletePod(
	options?: Partial<UseMutationOptions<any, Error, DeletePodParams>>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ clusterId, podId }) => podApi.delete(clusterId, podId),
		onSuccess: (...args) => {
			queryClient.invalidateQueries({ queryKey: ["pods"] });
			options?.onSuccess?.(...args);
		},
		...options,
	});
}
