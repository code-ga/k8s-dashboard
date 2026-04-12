import {
	api,
	type databaseTypes,
	getEdenErrorMessage,
	type SchemaStatic,
} from "@/lib/api";

type K8sService = SchemaStatic<databaseTypes.databaseTypes["k8sServices"]>;

export const serviceApi = {
	list: async (clusterId: number) => {
		const res = await api.api.services({ clusterId }).get();
		if (res.error) throw res.error;
		if (!res.data.data)
			throw new Error(res.data.message || "Failed to fetch services");
		return res.data.data as K8sService[];
	},

	get: async (clusterId: number, serviceId: number | string) => {
		const res = await api.api.services({ clusterId })({ id: serviceId }).get();
		if (res.error) throw res.error;
		if (!res.data.data)
			throw new Error(res.data.message || "Failed to fetch service");
		return res.data.data as K8sService;
	},

	create: async (clusterId: number, data: any) => {
		const res = await api.api.services({ clusterId }).post(data);
		if (res.error) throw new Error(getEdenErrorMessage(res.error));
		if (!res.data.data)
			throw new Error(res.data.message || "Failed to create service");
		return res.data.data;
	},

	delete: async (clusterId: number, serviceId: number | string) => {
		const res = await api.api
			.services({ clusterId })({ id: serviceId })
			.delete();
		if (res.error) throw new Error(getEdenErrorMessage(res.error));
		return res.data;
	},

	wake: async (clusterId: number, deploymentId: number) => {
		const res = await api.api
			.services({ clusterId })
			.wake({ deploymentId })
			.post({});
		if (res.error) throw new Error(getEdenErrorMessage(res.error));
		return res.data.data;
	},
};
