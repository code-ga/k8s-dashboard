import {
	type UseMutationOptions,
	type UseQueryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { configMapApi } from "@/api/configmap";
import type { databaseTypes, SchemaStatic } from "@/lib/api";

type ConfigMap = SchemaStatic<databaseTypes.databaseTypes["k8sConfigMaps"]>;

export function useConfigMaps(
	clusterId: number,
	options?: Partial<UseQueryOptions<ConfigMap[], Error>>,
) {
	return useQuery({
		queryKey: ["configmaps", clusterId],
		queryFn: () => configMapApi.list(clusterId),
		enabled: !!clusterId,
		...options,
	});
}

export function useAllConfigMaps(
	clusterId: number,
	options?: Partial<UseQueryOptions<ConfigMap[], Error>>,
) {
	return useQuery({
		queryKey: ["configmaps", clusterId, "all"],
		queryFn: () => configMapApi.listAll(clusterId),
		enabled: !!clusterId,
		...options,
	});
}

export function useConfigMap(
	clusterId: number,
	configMapId: number,
	options?: Partial<UseQueryOptions<ConfigMap, Error>>,
) {
	return useQuery({
		queryKey: ["configmap", clusterId, configMapId],
		queryFn: () => configMapApi.get(clusterId, configMapId),
		enabled: !!clusterId && !!configMapId,
		...options,
	});
}

type CreateConfigMapParams = {
	clusterId: number;
	data: Record<string, any>;
};

export function useCreateConfigMap(
	options?: Partial<UseMutationOptions<any, Error, CreateConfigMapParams>>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ clusterId, data }) => configMapApi.create(clusterId, data),
		onSuccess: (...args) => {
			queryClient.invalidateQueries({ queryKey: ["configmaps"] });
			options?.onSuccess?.(...args);
		},
		...options,
	});
}

type DeleteConfigMapParams = {
	clusterId: number;
	configMapId: number;
};

export function useDeleteConfigMap(
	options?: Partial<UseMutationOptions<any, Error, DeleteConfigMapParams>>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ clusterId, configMapId }) =>
			configMapApi.delete(clusterId, configMapId),
		onSuccess: (...args) => {
			queryClient.invalidateQueries({ queryKey: ["configmaps"] });
			options?.onSuccess?.(...args);
		},
		...options,
	});
}
