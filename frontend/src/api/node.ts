import {
	api,
	type databaseTypes,
	getEdenErrorMessage,
	type SchemaStatic,
} from "@/lib/api";

type Node = SchemaStatic<databaseTypes.databaseTypes["k8sClusterNode"]>;

export const nodeApi = {
	list: async (clusterId: number) => {
		const res = await api.api.nodes({ clusterId }).get();
		if (res.error) throw res.error;
		if (!res.data.data)
			throw new Error(res.data.message || "Failed to fetch nodes");
		return res.data.data as Node[];
	},

	getJoinToken: async (clusterId: number) => {
		const res = await api.api.nodes({ clusterId }).token.get();
		if (res.error) throw res.error;
		return res.data.data;
	},

	delete: async (clusterId: number, nodeId: number | string) => {
		const res = await api.api.nodes({ clusterId })({ id: nodeId }).delete();
		if (res.error) throw new Error(getEdenErrorMessage(res.error));
		return res.data;
	},
};
