import {
	type UseMutationOptions,
	type UseQueryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { nodeApi } from "@/api/node";
import type { databaseTypes, SchemaStatic } from "@/lib/api";

type Node = SchemaStatic<databaseTypes.databaseTypes["k8sClusterNode"]>;

export function useNodes(
	clusterId: number,
	options?: Partial<UseQueryOptions<Node[], Error>>,
) {
	return useQuery({
		queryKey: ["nodes", clusterId],
		queryFn: () => nodeApi.list(clusterId),
		enabled: !!clusterId,
		...options,
	});
}

export function useNodeJoinToken(
	clusterId: number,
	options?: Partial<UseQueryOptions<any, Error>>,
) {
	return useQuery({
		queryKey: ["node-join-token", clusterId],
		queryFn: () => nodeApi.getJoinToken(clusterId),
		enabled: !!clusterId,
		...options,
	});
}

type DeleteNodeParams = {
	clusterId: number;
	nodeId: number;
};

export function useDeleteNode(
	options?: Partial<UseMutationOptions<any, Error, DeleteNodeParams>>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ clusterId, nodeId }) => nodeApi.delete(clusterId, nodeId),
		onSuccess: (...args) => {
			queryClient.invalidateQueries({ queryKey: ["nodes"] });
			options?.onSuccess?.(...args);
		},
		...options,
	});
}
