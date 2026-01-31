import YAML from "yaml";

export interface ResourceResources {
	// cpuRequest?: string; // e.g., "100m"
	// cpuLimit?: string;
	// memoryRequest?: string; // e.g., "128Mi"
	// memoryLimit?: string;
	requests?: {
		cpu?: string;
		memory?: string;
	};
	limits?: {
		cpu?: string;
		memory?: string;
	};
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

export interface IngressRouteDTO {
	name: string;
	namespace: string;
	protocol: "http" | "tcp" | "udp";
	port: number; // externalPort on gateway
	internalPort: number;
	serviceName: string;
	domain?: string;
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
									cpu: dto.resources.requests?.cpu,
									memory: dto.resources.requests?.memory,
								},
								limits: {
									cpu: dto.resources.limits?.cpu,
									memory: dto.resources.limits?.memory,
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
											cpu: dto.resources.requests?.cpu,
											memory: dto.resources.requests?.memory,
										},
										limits: {
											cpu: dto.resources.limits?.cpu,
											memory: dto.resources.limits?.memory,
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

export const generateIngressRouteManifest = (dto: IngressRouteDTO): string => {
	const entryPoint =
		dto.protocol === "http"
			? "websecure"
			: `${dto.protocol === "tcp" ? "p" : "u"}${dto.port}`;

	if (dto.protocol === "http") {
		const manifest = {
			apiVersion: "traefik.io/v1alpha1",
			kind: "IngressRoute",
			metadata: {
				name: dto.name,
				namespace: dto.namespace,
				labels: dto.labels,
			},
			spec: {
				entryPoints: ["web", "websecure"],
				routes: [
					{
						match: `Host(\`${dto.domain}\`)`,
						kind: "Rule",
						services: [
							{
								name: dto.serviceName,
								port: dto.internalPort,
							},
						],
					},
				],
			},
		};
		return YAML.stringify(manifest);
	}

	if (dto.protocol === "tcp") {
		const manifest = {
			apiVersion: "traefik.io/v1alpha1",
			kind: "IngressRouteTCP",
			metadata: {
				name: dto.name,
				namespace: dto.namespace,
				labels: dto.labels,
			},
			spec: {
				entryPoints: [entryPoint],
				routes: [
					{
						match: "HostSNI(`*`)",
						services: [
							{
								name: dto.serviceName,
								port: dto.internalPort,
							},
						],
					},
				],
			},
		};
		return YAML.stringify(manifest);
	}

	if (dto.protocol === "udp") {
		const manifest = {
			apiVersion: "traefik.io/v1alpha1",
			kind: "IngressRouteUDP",
			metadata: {
				name: dto.name,
				namespace: dto.namespace,
				labels: dto.labels,
			},
			spec: {
				entryPoints: [entryPoint],
				routes: [
					{
						services: [
							{
								name: dto.serviceName,
								port: dto.internalPort,
							},
						],
					},
				],
			},
		};
		return YAML.stringify(manifest);
	}

	throw new Error(`Unsupported protocol: ${dto.protocol}`);
};
