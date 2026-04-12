import {
	type UseMutationOptions,
	type UseQueryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { serviceApi } from "@/api/service";
import type { databaseTypes, SchemaStatic } from "@/lib/api";

type K8sService = SchemaStatic<databaseTypes.databaseTypes["k8sServices"]>;

export function useServices(
	clusterId: number,
	options?: Partial<UseQueryOptions<K8sService[], Error>>,
) {
	return useQuery({
		queryKey: ["services", clusterId],
		queryFn: () => serviceApi.list(clusterId),
		enabled: !!clusterId,
		...options,
	});
}

export function useService(
	clusterId: number,
	serviceId: number,
	options?: Partial<UseQueryOptions<K8sService, Error>>,
) {
	return useQuery({
		queryKey: ["service", clusterId, serviceId],
		queryFn: () => serviceApi.get(clusterId, serviceId),
		enabled: !!clusterId && !!serviceId,
		...options,
	});
}

type CreateServiceParams = {
	clusterId: number;
	data: Record<string, any>;
};

export function useCreateService(
	options?: Partial<UseMutationOptions<any, Error, CreateServiceParams>>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ clusterId, data }) => serviceApi.create(clusterId, data),
		onSuccess: (...args) => {
			queryClient.invalidateQueries({ queryKey: ["services"] });
			options?.onSuccess?.(...args);
		},
		...options,
	});
}

type DeleteServiceParams = {
	clusterId: number;
	serviceId: number;
};

export function useDeleteService(
	options?: Partial<UseMutationOptions<any, Error, DeleteServiceParams>>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ clusterId, serviceId }) =>
			serviceApi.delete(clusterId, serviceId),
		onSuccess: (...args) => {
			queryClient.invalidateQueries({ queryKey: ["services"] });
			options?.onSuccess?.(...args);
		},
		...options,
	});
}

export function useWakeService(
	options?: Partial<
		UseMutationOptions<any, Error, { clusterId: number; deploymentId: number }>
	>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ clusterId, deploymentId }) =>
			serviceApi.wake(clusterId, deploymentId),
		onSuccess: (...args) => {
			queryClient.invalidateQueries({ queryKey: ["services"] });
			options?.onSuccess?.(...args);
		},
		...options,
	});
}
