import {
	type UseMutationOptions,
	type UseQueryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { secretApi } from "@/api/secret";
import type { databaseTypes, SchemaStatic } from "@/lib/api";

type Secret = SchemaStatic<databaseTypes.databaseTypes["k8sSecrets"]>;

export function useSecrets(
	clusterId: number,
	options?: Partial<UseQueryOptions<Secret[], Error>>,
) {
	return useQuery({
		queryKey: ["secrets", clusterId],
		queryFn: () => secretApi.list(clusterId),
		enabled: !!clusterId,
		...options,
	});
}

export function useAllSecrets(
	clusterId: number,
	options?: Partial<UseQueryOptions<Secret[], Error>>,
) {
	return useQuery({
		queryKey: ["secrets", clusterId, "all"],
		queryFn: () => secretApi.listAll(clusterId),
		enabled: !!clusterId,
		...options,
	});
}

export function useSecret(
	clusterId: number,
	secretId: number,
	options?: Partial<UseQueryOptions<Secret, Error>>,
) {
	return useQuery({
		queryKey: ["secret", clusterId, secretId],
		queryFn: () => secretApi.get(clusterId, secretId),
		enabled: !!clusterId && !!secretId,
		...options,
	});
}

type CreateSecretParams = {
	clusterId: number;
	data: Record<string, any>;
};

export function useCreateSecret(
	options?: Partial<UseMutationOptions<any, Error, CreateSecretParams>>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ clusterId, data }) => secretApi.create(clusterId, data),
		onSuccess: (...args) => {
			queryClient.invalidateQueries({ queryKey: ["secrets"] });
			options?.onSuccess?.(...args);
		},
		...options,
	});
}

type DeleteSecretParams = {
	clusterId: number;
	secretId: number;
};

export function useDeleteSecret(
	options?: Partial<UseMutationOptions<any, Error, DeleteSecretParams>>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ clusterId, secretId }) =>
			secretApi.delete(clusterId, secretId),
		onSuccess: (...args) => {
			queryClient.invalidateQueries({ queryKey: ["secrets"] });
			options?.onSuccess?.(...args);
		},
		...options,
	});
}
