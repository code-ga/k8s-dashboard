import {
	api,
	type databaseTypes,
	getEdenErrorMessage,
	type SchemaStatic,
} from "@/lib/api";

export type Pod = SchemaStatic<databaseTypes.databaseTypes["k8sPods"]>;

export const podApi = {
	list: async (clusterId: number) => {
		const res = await api.api.pods({ clusterId }).get();
		if (res.error) throw res.error;
		if (!res.data.data)
			throw new Error(res.data.message || "Failed to fetch pods");
		return res.data.data;
	},

	listAll: async (clusterId: number) => {
		const res = await api.api.pods({ clusterId }).all.get();
		if (res.error) throw res.error;
		if (!res.data.data)
			throw new Error(res.data.message || "Failed to fetch pods");
		return res.data.data;
	},

	get: async (clusterId: number, podId: number | string) => {
		const res = await api.api.pods({ clusterId })({ id: podId }).get();
		if (res.error) throw res.error;
		if (!res.data.data)
			throw new Error(res.data.message || "Failed to fetch pod");
		return res.data.data;
	},

	describe: async (clusterId: number, podId: number | string) => {
		const res = await api.api.pods({ clusterId })({ id: podId }).describe.get();
		if (res.error) throw res.error;
		return res.data.data;
	},

	create: async (clusterId: number, data: any) => {
		const res = await api.api.pods({ clusterId }).post(data);
		if (res.error) throw new Error(getEdenErrorMessage(res.error));
		if (!res.data.data)
			throw new Error(res.data.message || "Failed to create pod");
		return res.data.data;
	},

	update: async (
		clusterId: number,
		podId: number | string,
		data: Record<string, any>,
	) => {
		const res = await api.api.pods({ clusterId })({ id: podId }).patch(data);
		if (res.error) throw new Error(getEdenErrorMessage(res.error));
		if (!res.data.data)
			throw new Error(res.data.message || "Failed to update pod");
		return res.data.data;
	},

	delete: async (clusterId: number, podId: number | string) => {
		const res = await api.api.pods({ clusterId })({ id: podId }).delete();
		if (res.error) throw new Error(getEdenErrorMessage(res.error));
		return res.data;
	},
};
