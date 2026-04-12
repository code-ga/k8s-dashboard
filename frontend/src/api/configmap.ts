import {
	api,
	type databaseTypes,
	getEdenErrorMessage,
	type SchemaStatic,
} from "@/lib/api";

type ConfigMap = SchemaStatic<databaseTypes.databaseTypes["k8sConfigMaps"]>;

export const configMapApi = {
	list: async (clusterId: number) => {
		const res = await api.api.configmaps({ clusterId }).get();
		if (res.error) throw res.error;
		if (!res.data.data)
			throw new Error(res.data.message || "Failed to fetch configmaps");
		return res.data.data as ConfigMap[];
	},

	listAll: async (clusterId: number) => {
		const res = await api.api.configmaps({ clusterId }).all.get();
		if (res.error) throw res.error;
		if (!res.data.data)
			throw new Error(res.data.message || "Failed to fetch configmaps");
		return res.data.data as ConfigMap[];
	},

	get: async (clusterId: number, configMapId: number | string) => {
		const res = await api.api
			.configmaps({ clusterId })({ id: configMapId })
			.get();
		if (res.error) throw res.error;
		if (!res.data.data)
			throw new Error(res.data.message || "Failed to fetch configmap");
		return res.data.data as ConfigMap;
	},

	create: async (clusterId: number, data: any) => {
		const res = await api.api.configmaps({ clusterId }).post(data);
		if (res.error) throw new Error(getEdenErrorMessage(res.error));
		if (!res.data.data)
			throw new Error(res.data.message || "Failed to create configmap");
		return res.data.data;
	},

	delete: async (clusterId: number, configMapId: number | string) => {
		const res = await api.api
			.configmaps({ clusterId })({ id: configMapId })
			.delete();
		if (res.error) throw new Error(getEdenErrorMessage(res.error));
		return res.data;
	},
};
