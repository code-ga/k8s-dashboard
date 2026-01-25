import YAML from "yaml";

export interface ResourceResources {
	cpuRequest?: string; // e.g., "100m"
	cpuLimit?: string;
	memoryRequest?: string; // e.g., "128Mi"
	memoryLimit?: string;
}

export interface PodDTO {
	name: string;
	namespace: string;
	image: string;
	command?: string[];
	args?: string[];
	env?: Record<string, string>;
	ports?: { containerPort: number; name?: string }[];
	resources?: ResourceResources;
	labels?: Record<string, string>;
}

export interface DeploymentDTO {
	name: string;
	namespace: string;
	image: string;
	replicas: number;
	command?: string[];
	args?: string[];
	env?: Record<string, string>;
	ports?: { containerPort: number; name?: string }[];
	resources?: ResourceResources;
	labels?: Record<string, string>;
	selector?: Record<string, string>;
}

export interface ServiceDTO {
	name: string;
	namespace: string;
	type: "ClusterIP" | "NodePort" | "LoadBalancer";
	selector: Record<string, string>;
	ports: {
		port: number;
		targetPort: number;
		nodePort?: number;
		protocol?: "TCP" | "UDP";
		name?: string;
	}[];
	labels?: Record<string, string>;
}

export const generatePodManifest = (dto: PodDTO): string => {
	const manifest = {
		apiVersion: "v1",
		kind: "Pod",
		metadata: {
			name: dto.name,
			namespace: dto.namespace,
			labels: dto.labels || { app: dto.name },
		},
		spec: {
			containers: [
				{
					name: dto.name,
					image: dto.image,
					command: dto.command,
					args: dto.args,
					env: dto.env
						? Object.entries(dto.env).map(([name, value]) => ({ name, value }))
						: undefined,
					ports: dto.ports,
					resources: dto.resources
						? {
								requests: {
									cpu: dto.resources.cpuRequest,
									memory: dto.resources.memoryRequest,
								},
								limits: {
									cpu: dto.resources.cpuLimit,
									memory: dto.resources.memoryLimit,
								},
							}
						: undefined,
				},
			],
		},
	};
	return YAML.stringify(manifest);
};

export const generateDeploymentManifest = (dto: DeploymentDTO): string => {
	const labels = dto.labels || { app: dto.name };
	const selector = dto.selector || { app: dto.name };

	const manifest = {
		apiVersion: "apps/v1",
		kind: "Deployment",
		metadata: {
			name: dto.name,
			namespace: dto.namespace,
			labels: labels,
		},
		spec: {
			replicas: dto.replicas,
			selector: {
				matchLabels: selector,
			},
			template: {
				metadata: {
					labels: { ...labels, ...selector }, // Ensure selector matches template labels
				},
				spec: {
					containers: [
						{
							name: dto.name,
							image: dto.image,
							command: dto.command,
							args: dto.args,
							env: dto.env
								? Object.entries(dto.env).map(([name, value]) => ({
										name,
										value,
									}))
								: undefined,
							ports: dto.ports,
							resources: dto.resources
								? {
										requests: {
											cpu: dto.resources.cpuRequest,
											memory: dto.resources.memoryRequest,
										},
										limits: {
											cpu: dto.resources.cpuLimit,
											memory: dto.resources.memoryLimit,
										},
									}
								: undefined,
						},
					],
				},
			},
		},
	};
	return YAML.stringify(manifest);
};

export const generateServiceManifest = (dto: ServiceDTO): string => {
	const manifest = {
		apiVersion: "v1",
		kind: "Service",
		metadata: {
			name: dto.name,
			namespace: dto.namespace,
			labels: dto.labels || { app: dto.name },
		},
		spec: {
			type: dto.type,
			selector: dto.selector,
			ports: dto.ports,
		},
	};
	return YAML.stringify(manifest);
};
