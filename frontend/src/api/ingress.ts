import {
	api,
	type databaseTypes,
	getEdenErrorMessage,
	type SchemaStatic,
} from "@/lib/api";

type Ingress = SchemaStatic<databaseTypes.databaseTypes["k8sIngresses"]>;

export const ingressApi = {
	list: async (clusterId: number) => {
		const res = await api.api.ingresses({ clusterId }).get();
		if (res.error) throw res.error;
		if (!res.data.data)
			throw new Error(res.data.message || "Failed to fetch ingresses");
		return res.data.data as Ingress[];
	},

	get: async (clusterId: number, ingressId: number | string) => {
		const res = await api.api.ingresses({ clusterId })({ id: ingressId }).get();
		if (res.error) throw res.error;
		if (!res.data.data)
			throw new Error(res.data.message || "Failed to fetch ingress");
		return res.data.data as Ingress;
	},

	expose: async (clusterId: number, data: any) => {
		const res = await api.api.ingresses({ clusterId }).expose.post(data);
		if (res.error) throw new Error(getEdenErrorMessage(res.error));
		if (!res.data.data)
			throw new Error(res.data.message || "Failed to create ingress");
		return res.data.data;
	},

	delete: async (clusterId: number, ingressId: number | string) => {
		const res = await api.api
			.ingresses({ clusterId })({ id: ingressId })
			.delete();
		if (res.error) throw new Error(getEdenErrorMessage(res.error));
		return res.data;
	},
};
