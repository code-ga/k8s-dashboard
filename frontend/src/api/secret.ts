import {
	api,
	type databaseTypes,
	getEdenErrorMessage,
	type SchemaStatic,
} from "@/lib/api";

type Secret = SchemaStatic<databaseTypes.databaseTypes["k8sSecrets"]>;

export const secretApi = {
	list: async (clusterId: number) => {
		const res = await api.api.secrets({ clusterId }).get();
		if (res.error) throw res.error;
		if (!res.data.data)
			throw new Error(res.data.message || "Failed to fetch secrets");
		return res.data.data as Secret[];
	},

	listAll: async (clusterId: number) => {
		const res = await api.api.secrets({ clusterId }).all.get();
		if (res.error) throw res.error;
		if (!res.data.data)
			throw new Error(res.data.message || "Failed to fetch secrets");
		return res.data.data as Secret[];
	},

	get: async (clusterId: number, secretId: number | string) => {
		const res = await api.api.secrets({ clusterId })({ id: secretId }).get();
		if (res.error) throw res.error;
		if (!res.data.data)
			throw new Error(res.data.message || "Failed to fetch secret");
		return res.data.data as Secret;
	},

	create: async (clusterId: number, data: any) => {
		const res = await api.api.secrets({ clusterId }).post(data);
		if (res.error) throw new Error(getEdenErrorMessage(res.error));
		if (!res.data.data)
			throw new Error(res.data.message || "Failed to create secret");
		return res.data.data;
	},

	delete: async (clusterId: number, secretId: number | string) => {
		const res = await api.api.secrets({ clusterId })({ id: secretId }).delete();
		if (res.error) throw new Error(getEdenErrorMessage(res.error));
		return res.data;
	},
};
