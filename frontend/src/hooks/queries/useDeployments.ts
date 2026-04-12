import {
	type UseMutationOptions,
	type UseQueryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { deploymentApi } from "@/api/deployment";
import type { databaseTypes, SchemaStatic } from "@/lib/api";

type Deployment = SchemaStatic<databaseTypes.databaseTypes["k8sDeployments"]>;

export function useDeployments(
	clusterId: number,
	options?: Partial<UseQueryOptions<Deployment[], Error>>,
) {
	return useQuery({
		queryKey: ["deployments", clusterId],
		queryFn: () => deploymentApi.list(clusterId),
		enabled: !!clusterId,
		...options,
	});
}

export function useAllDeployments(
	clusterId: number,
	options?: Partial<UseQueryOptions<Deployment[], Error>>,
) {
	return useQuery({
		queryKey: ["deployments", clusterId, "all"],
		queryFn: () => deploymentApi.listAll(clusterId),
		enabled: !!clusterId,
		...options,
	});
}

export function useDeployment(
	clusterId: number,
	deploymentId: number,
	options?: Partial<UseQueryOptions<Deployment, Error>>,
) {
	return useQuery({
		queryKey: ["deployment", clusterId, deploymentId],
		queryFn: () => deploymentApi.get(clusterId, deploymentId),
		enabled: !!clusterId && !!deploymentId,
		...options,
	});
}

export function useDeploymentDescribe(
	clusterId: number,
	deploymentId: number,
	options?: Partial<UseQueryOptions<any, Error>>,
) {
	return useQuery({
		queryKey: ["deployment-describe", clusterId, deploymentId],
		queryFn: () => deploymentApi.describe(clusterId, deploymentId),
		enabled: !!clusterId && !!deploymentId,
		...options,
	});
}

type CreateDeploymentParams = {
	clusterId: number;
	data: Record<string, any>;
};

export function useCreateDeployment(
	options?: Partial<UseMutationOptions<any, Error, CreateDeploymentParams>>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ clusterId, data }) => deploymentApi.create(clusterId, data),
		onSuccess: (...args) => {
			queryClient.invalidateQueries({ queryKey: ["deployments"] });
			options?.onSuccess?.(...args);
		},
		...options,
	});
}

type UpdateDeploymentParams = {
	clusterId: number;
	deploymentId: number;
	data: Record<string, any>;
};

export function useUpdateDeployment(
	options?: Partial<UseMutationOptions<any, Error, UpdateDeploymentParams>>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ clusterId, deploymentId, data }) =>
			deploymentApi.update(clusterId, deploymentId, data),
		onSuccess: (...args) => {
			queryClient.invalidateQueries({ queryKey: ["deployments"] });
			queryClient.invalidateQueries({ queryKey: ["deployment"] });
			options?.onSuccess?.(...args);
		},
		...options,
	});
}

type UpdateDeploymentScaleParams = {
	clusterId: number;
	deploymentId: number;
	data: {
		isAutoScaling?: boolean;
		isAlwaysRunning?: boolean;
		idleTimeoutSeconds?: number;
	};
};

export function useUpdateDeploymentScale(
	options?: Partial<
		UseMutationOptions<any, Error, UpdateDeploymentScaleParams>
	>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ clusterId, deploymentId, data }) =>
			deploymentApi.update(clusterId, deploymentId, data),
		onSuccess: (...args) => {
			queryClient.invalidateQueries({ queryKey: ["deployments"] });
			options?.onSuccess?.(...args);
		},
		...options,
	});
}

type DeleteDeploymentParams = {
	clusterId: number;
	deploymentId: number;
};

export function useDeleteDeployment(
	options?: Partial<UseMutationOptions<any, Error, DeleteDeploymentParams>>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ clusterId, deploymentId }) =>
			deploymentApi.delete(clusterId, deploymentId),
		onSuccess: (...args) => {
			queryClient.invalidateQueries({ queryKey: ["deployments"] });
			options?.onSuccess?.(...args);
		},
		...options,
	});
}

export function useRedeployDeployment(
	options?: Partial<
		UseMutationOptions<any, Error, { clusterId: number; deploymentId: number }>
	>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ clusterId, deploymentId }) =>
			deploymentApi.redeploy(clusterId, deploymentId),
		onSuccess: (...args) => {
			queryClient.invalidateQueries({ queryKey: ["deployments"] });
			options?.onSuccess?.(...args);
		},
		...options,
	});
}
