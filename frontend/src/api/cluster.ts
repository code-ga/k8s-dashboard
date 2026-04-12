import {
	api,
	type databaseTypes,
	getEdenErrorMessage,
	type SchemaStatic,
} from "@/lib/api";

type Cluster = SchemaStatic<databaseTypes.databaseTypes["k8sCluster"]>;

export const clusterApi = {
	list: async () => {
		const res = await api.api.cluster.get();
		if (res.error) throw res.error;
		if (!res.data.data)
			throw new Error(res.data.message || "Failed to fetch clusters");
		return res.data.data as Cluster[];
	},

	get: async (id: number) => {
		const res = await api.api.cluster({ id }).get();
		if (res.error) throw res.error;
		if (!res.data.data)
			throw new Error(res.data.message || "Failed to fetch cluster");
		return res.data.data as Cluster;
	},

	create: async (data: any) => {
		const res = await api.api.cluster.post(data);
		if (res.error) throw new Error(getEdenErrorMessage(res.error));
		if (!res.data.data)
			throw new Error(res.data.message || "Failed to create cluster");
		return res.data.data;
	},

	update: async (id: number, data: Record<string, any>) => {
		const res = await api.api.cluster({ id }).patch(data);
		if (res.error) throw new Error(getEdenErrorMessage(res.error));
		if (!res.data.data)
			throw new Error(res.data.message || "Failed to update cluster");
		return res.data.data;
	},

	delete: async (id: number) => {
		const res = await api.api.cluster({ id }).delete();
		if (res.error) throw new Error(getEdenErrorMessage(res.error));
		return res.data;
	},

	getAgentConfig: async (id: number) => {
		const res = await api.api.cluster({ id })["agent-config"].get();
		if (res.error) throw res.error;
		return res.data.data;
	},

	getEvents: async (id: number) => {
		const res = await api.api.cluster({ id }).events.get();
		if (res.error) throw res.error;
		return res.data.data;
	},
};
