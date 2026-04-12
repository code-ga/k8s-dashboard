import { api, getEdenErrorMessage } from "@/lib/api";

export const deploymentApi = {
	list: async (clusterId: number) => {
		const res = await api.api.deployments({ clusterId }).get();
		if (res.error) throw res.error;
		if (!res.data.data)
			throw new Error(res.data.message || "Failed to fetch deployments");
		return res.data.data as any[];
	},

	listAll: async (clusterId: number) => {
		const res = await api.api.deployments({ clusterId }).all.get();
		if (res.error) throw res.error;
		if (!res.data.data)
			throw new Error(res.data.message || "Failed to fetch deployments");
		return res.data.data as any[];
	},

	get: async (clusterId: number, deploymentId: number | string) => {
		const res = await api.api
			.deployments({ clusterId })({ id: deploymentId })
			.get();
		if (res.error) throw res.error;
		if (!res.data.data)
			throw new Error(res.data.message || "Failed to fetch deployment");
		return res.data.data as any;
	},

	create: async (clusterId: number, data: any) => {
		const res = await api.api.deployments({ clusterId }).post(data);
		if (res.error) throw new Error(getEdenErrorMessage(res.error));
		if (!res.data.data)
			throw new Error(res.data.message || "Failed to create deployment");
		return res.data.data;
	},

	update: async (
		clusterId: number,
		deploymentId: number | string,
		data: Record<string, any>,
	) => {
		const res = await api.api
			.deployments({ clusterId })({ id: deploymentId })
			.patch(data);
		if (res.error) throw new Error(getEdenErrorMessage(res.error));
		if (!res.data.data)
			throw new Error(res.data.message || "Failed to update deployment");
		return res.data.data;
	},

	delete: async (clusterId: number, deploymentId: number | string) => {
		const res = await api.api
			.deployments({ clusterId })({ id: deploymentId })
			.delete();
		if (res.error) throw new Error(getEdenErrorMessage(res.error));
		return res.data;
	},

	describe: async (clusterId: number, deploymentId: number | string) => {
		const res = await api.api
			.deployments({ clusterId })({ id: deploymentId })
			.describe.get();
		if (res.error) throw res.error;
		return res.data.data;
	},

	redeploy: async (clusterId: number, deploymentId: number | string) => {
		const res = await api.api
			.deployments({ clusterId })({ id: deploymentId })
			.redeploy.patch();
		if (res.error) throw new Error(getEdenErrorMessage(res.error));
		return res.data.data;
	},
};
