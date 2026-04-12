import {
	type UseMutationOptions,
	type UseQueryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { clusterApi } from "@/api/cluster";
import type { databaseTypes, SchemaStatic } from "@/lib/api";

type Cluster = SchemaStatic<databaseTypes.databaseTypes["k8sCluster"]>;

export function useClusters(
	options?: Partial<UseQueryOptions<Cluster[], Error>>,
) {
	return useQuery({
		queryKey: ["clusters"],
		queryFn: () => clusterApi.list(),
		...options,
	});
}

export function useCluster(
	clusterId: number,
	options?: Partial<UseQueryOptions<Cluster, Error>>,
) {
	return useQuery({
		queryKey: ["cluster", clusterId],
		queryFn: () => clusterApi.get(clusterId),
		enabled: !!clusterId,
		...options,
	});
}

type CreateClusterParams = {
	data: Record<string, any>;
};

export function useCreateCluster(
	options?: Partial<UseMutationOptions<any, Error, CreateClusterParams>>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ data }) => clusterApi.create(data),
		onSuccess: (...args) => {
			queryClient.invalidateQueries({ queryKey: ["clusters"] });
			options?.onSuccess?.(...args);
		},
		...options,
	});
}

type UpdateClusterParams = {
	clusterId: number;
	data: Record<string, any>;
};

export function useUpdateCluster(
	options?: Partial<UseMutationOptions<any, Error, UpdateClusterParams>>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ clusterId, data }) => clusterApi.update(clusterId, data),
		onSuccess: (...args) => {
			queryClient.invalidateQueries({ queryKey: ["clusters"] });
			queryClient.invalidateQueries({ queryKey: ["cluster"] });
			options?.onSuccess?.(...args);
		},
		...options,
	});
}

type DeleteClusterParams = {
	clusterId: number;
};

export function useDeleteCluster(
	options?: Partial<UseMutationOptions<any, Error, DeleteClusterParams>>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ clusterId }) => clusterApi.delete(clusterId),
		onSuccess: (...args) => {
			queryClient.invalidateQueries({ queryKey: ["clusters"] });
			options?.onSuccess?.(...args);
		},
		...options,
	});
}

export function useClusterEvents(
	clusterId: number,
	options?: Partial<UseQueryOptions<any, Error>>,
) {
	return useQuery({
		queryKey: ["cluster-events", clusterId],
		queryFn: () => clusterApi.getEvents(clusterId),
		enabled: !!clusterId,
		...options,
	});
}
