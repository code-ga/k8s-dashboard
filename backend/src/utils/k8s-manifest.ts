import YAML from "yaml";

export interface ResourceResources {
	// cpuRequest?: string; // e.g., "100m"
	// cpuLimit?: string;
	// memoryRequest?: string; // e.g., "128Mi"
	// memoryLimit?: string;
	requests?: {
		cpu?: string | number; // Allow both string (e.g., "100m") and number (e.g., 0.1)
		memory?: string | number; // Allow both string (e.g., "128Mi") and number (e.g., 134217728)
	};
	limits?: {
		cpu?: string | number;
		memory?: string | number;
	};
}

export interface ConfigMapRef {
	env?: Array<{ name: string; configMapName: string; key: string }>;
	envFrom?: Array<{ configMapName: string; prefix?: string }>;
	volumes?: Array<{
		name: string;
		configMapName: string;
		mountPath: string;
		items?: Array<{ key: string; path: string }>;
	}>;
}

export interface SecretRef {
	env?: Array<{ name: string; secretName: string; key: string }>;
	envFrom?: Array<{ secretName: string; prefix?: string }>;
	volumes?: Array<{
		name: string;
		secretName: string;
		mountPath: string;
		items?: Array<{ key: string; path: string }>;
	}>;
}

export interface PodDTO {
	name: string;
	namespace: string;
	image?: string; // This is necessary for the pod creation but updating image is not supported
	command?: string[];
	args?: string[];
	env?: Record<string, string>;
	ports?: { containerPort: number; name?: string }[];
	annotations?: Record<string, string>;
	resources?: ResourceResources;
	labels?: Record<string, string>;
	configMapRefs?: ConfigMapRef;
	secretRefs?: SecretRef;
}

export interface DeploymentDTO {
	name: string;
	namespace: string;
	image?: string;
	replicas: number;
	command?: string[];
	args?: string[];
	env?: Record<string, string>;
	ports?: { containerPort: number; name?: string }[];
	resources?: ResourceResources;
	labels?: Record<string, string>;
	selector?: Record<string, string>;
	configMapRefs?: ConfigMapRef;
	secretRefs?: SecretRef;
	annotations?: Record<string, string>;
	templateAnnotations?: Record<string, string>;
}

export interface ServicePortDTO {
	port: number;
	targetPort: number;
	nodePort?: number;
	protocol?: "TCP" | "UDP";
	name?: string;
}

export interface ServiceDTO {
	name: string;
	namespace: string;
	type: "ClusterIP" | "NodePort" | "LoadBalancer";
	selector: Record<string, string>;
	ports: ServicePortDTO[];
	labels?: Record<string, string>;
	annotations?: Record<string, string>;
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
	tls?: boolean; // Only applicable for HTTP routes
	annotations?: Record<string, string>;
}

export interface ConfigMapDTO {
	name: string;
	namespace: string;
	data?: Record<string, string>;
	binaryData?: Record<string, string>;
	labels?: Record<string, string>;
	annotations?: Record<string, string>;
}

export interface SecretDTO {
	name: string;
	namespace: string;
	type?: string;
	data?: Record<string, string>;
	labels?: Record<string, string>;
	annotations?: Record<string, string>;
}
 
const cleanResources = (res?: ResourceResources) => {
	if (!res) return undefined;
	const requests: Record<string, string | number> = {};
	
	const cpuReq = res.requests?.cpu;
	if (cpuReq !== undefined && cpuReq !== null && cpuReq !== "" && cpuReq !== "0" && cpuReq !== 0) {
		requests.cpu = cpuReq;
	}
	const memReq = res.requests?.memory;
	if (memReq !== undefined && memReq !== null && memReq !== "" && memReq !== "0" && memReq !== 0) {
		requests.memory = memReq;
	}

	const limits: Record<string, string | number> = {};
	const cpuLimit = res.limits?.cpu;
	if (cpuLimit !== undefined && cpuLimit !== null && cpuLimit !== "" && cpuLimit !== "0" && cpuLimit !== 0) {
		limits.cpu = cpuLimit;
	}
	const memLimit = res.limits?.memory;
	if (memLimit !== undefined && memLimit !== null && memLimit !== "" && memLimit !== "0" && memLimit !== 0) {
		limits.memory = memLimit;
	}

	const result: {
		requests?: Record<string, string | number>;
		limits?: Record<string, string | number>;
	} = {};
	if (Object.keys(requests).length > 0) result.requests = requests;
	if (Object.keys(limits).length > 0) result.limits = limits;
	return Object.keys(result).length > 0 ? result : undefined;
};


export const generatePodManifest = (dto: PodDTO): string => {
	// Build environment variables
	const envVars: any[] = [];

	// Regular env vars
	if (dto.env) {
		envVars.push(
			...Object.entries(dto.env).map(([name, value]) => ({ name, value })),
		);
	}

	// ConfigMap env refs
	if (dto.configMapRefs?.env) {
		envVars.push(
			...dto.configMapRefs.env.map((ref) => ({
				name: ref.name,
				valueFrom: {
					configMapKeyRef: {
						name: ref.configMapName,
						key: ref.key,
					},
				},
			})),
		);
	}

	// Secret env refs
	if (dto.secretRefs?.env) {
		envVars.push(
			...dto.secretRefs.env.map((ref) => ({
				name: ref.name,
				valueFrom: {
					secretKeyRef: {
						name: ref.secretName,
						key: ref.key,
					},
				},
			})),
		);
	}

	// Build envFrom (load all keys from ConfigMap/Secret)
	const envFrom: any[] = [];

	if (dto.configMapRefs?.envFrom) {
		envFrom.push(
			...dto.configMapRefs.envFrom.map((ref) => ({
				configMapRef: {
					name: ref.configMapName,
				},
				prefix: ref.prefix,
			})),
		);
	}

	if (dto.secretRefs?.envFrom) {
		envFrom.push(
			...dto.secretRefs.envFrom.map((ref) => ({
				secretRef: {
					name: ref.secretName,
				},
				prefix: ref.prefix,
			})),
		);
	}

	// Build volumes and volumeMounts
	const volumes: any[] = [];
	const volumeMounts: any[] = [];

	if (dto.configMapRefs?.volumes) {
		for (const vol of dto.configMapRefs.volumes) {
			volumes.push({
				name: vol.name,
				configMap: {
					name: vol.configMapName,
					items: vol.items,
				},
			});
			volumeMounts.push({
				name: vol.name,
				mountPath: vol.mountPath,
			});
		}
	}

	if (dto.secretRefs?.volumes) {
		for (const vol of dto.secretRefs.volumes) {
			volumes.push({
				name: vol.name,
				secret: {
					secretName: vol.secretName,
					items: vol.items,
				},
			});
			volumeMounts.push({
				name: vol.name,
				mountPath: vol.mountPath,
			});
		}
	}


	const manifest = {
		apiVersion: "v1",
		kind: "Pod",
		metadata: {
			name: dto.name,
			namespace: dto.namespace,
			labels: dto.labels || { app: dto.name },
			annotations: dto.annotations,
		},
		spec: {
			containers: [
				{
					name: dto.name,
					image: dto.image,
					imagePullPolicy: "Always",
					command:
						dto.command && dto.command.length > 0 ? dto.command : undefined,
					args: dto.args && dto.args.length > 0 ? dto.args : undefined,
					env: envVars.length > 0 ? envVars : undefined,
					envFrom: envFrom.length > 0 ? envFrom : undefined,
					ports: dto.ports && dto.ports.length > 0 ? dto.ports : undefined,
					volumeMounts: volumeMounts.length > 0 ? volumeMounts : undefined,
					resources: cleanResources(dto.resources),
				},
			],
			volumes: volumes.length > 0 ? volumes : undefined,
		},
	};
	return YAML.stringify(manifest);
};

export const generateDeploymentManifest = (dto: DeploymentDTO): string => {
	const labels = dto.labels || { app: dto.name };
	const selector = dto.selector || { app: dto.name };

	// Build environment variables
	const envVars: any[] = [];

	// Regular env vars
	if (dto.env) {
		envVars.push(
			...Object.entries(dto.env).map(([name, value]) => ({ name, value })),
		);
	}

	// ConfigMap env refs
	if (dto.configMapRefs?.env) {
		envVars.push(
			...dto.configMapRefs.env.map((ref) => ({
				name: ref.name,
				valueFrom: {
					configMapKeyRef: {
						name: ref.configMapName,
						key: ref.key,
					},
				},
			})),
		);
	}

	// Secret env refs
	if (dto.secretRefs?.env) {
		envVars.push(
			...dto.secretRefs.env.map((ref) => ({
				name: ref.name,
				valueFrom: {
					secretKeyRef: {
						name: ref.secretName,
						key: ref.key,
					},
				},
			})),
		);
	}

	// Build envFrom (load all keys from ConfigMap/Secret)
	const envFrom: any[] = [];

	if (dto.configMapRefs?.envFrom) {
		envFrom.push(
			...dto.configMapRefs.envFrom.map((ref) => ({
				configMapRef: {
					name: ref.configMapName,
				},
				prefix: ref.prefix,
			})),
		);
	}

	if (dto.secretRefs?.envFrom) {
		envFrom.push(
			...dto.secretRefs.envFrom.map((ref) => ({
				secretRef: {
					name: ref.secretName,
				},
				prefix: ref.prefix,
			})),
		);
	}

	// Build volumes and volumeMounts
	const volumes: any[] = [];
	const volumeMounts: any[] = [];

	if (dto.configMapRefs?.volumes) {
		for (const vol of dto.configMapRefs.volumes) {
			volumes.push({
				name: vol.name,
				configMap: {
					name: vol.configMapName,
					items: vol.items,
				},
			});
			volumeMounts.push({
				name: vol.name,
				mountPath: vol.mountPath,
			});
		}
	}

	if (dto.secretRefs?.volumes) {
		for (const vol of dto.secretRefs.volumes) {
			volumes.push({
				name: vol.name,
				secret: {
					secretName: vol.secretName,
					items: vol.items,
				},
			});
			volumeMounts.push({
				name: vol.name,
				mountPath: vol.mountPath,
			});
		}
	}


	const manifest = {
		apiVersion: "apps/v1",
		kind: "Deployment",
		metadata: {
			name: dto.name,
			namespace: dto.namespace,
			labels: labels,
			annotations: dto.annotations,
		},
		spec: {
			replicas: dto.replicas,
			selector: {
				matchLabels: selector,
			},
			template: {
				metadata: {
					labels: { ...labels, ...selector }, // Ensure selector matches template labels
					annotations: dto.templateAnnotations,
				},
				spec: {
					containers: [
						{
							name: dto.name,
							image: dto.image,
							imagePullPolicy: "Always",
							command:
								dto.command && dto.command.length > 0 ? dto.command : undefined,
							args: dto.args && dto.args.length > 0 ? dto.args : undefined,
							env: envVars.length > 0 ? envVars : undefined,
							envFrom: envFrom.length > 0 ? envFrom : undefined,
							ports: dto.ports && dto.ports.length > 0 ? dto.ports : undefined,
							volumeMounts: volumeMounts.length > 0 ? volumeMounts : undefined,
							resources: cleanResources(dto.resources),
						},
					],
					volumes: volumes.length > 0 ? volumes : undefined,
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
			annotations: dto.annotations,
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
				annotations: {
					"traefik.ingress.kubernetes.io/router.tls":
						dto.tls === false ? "false" : "true",
					...dto.annotations,
				},
			},
			spec: {
				entryPoints: dto.tls === false ? ["web"] : ["web", "websecure"],
				tls: {
					certResolver: "letsencrypt",
				},
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

export const generateConfigMapManifest = (dto: ConfigMapDTO): string => {
	const manifest = {
		apiVersion: "v1",
		kind: "ConfigMap",
		metadata: {
			name: dto.name,
			namespace: dto.namespace,
			labels: dto.labels,
			annotations: dto.annotations,
		},
		data: dto.data,
		binaryData: dto.binaryData,
	};
	return YAML.stringify(manifest);
};

export const generateSecretManifest = (dto: SecretDTO): string => {
	const manifest = {
		apiVersion: "v1",
		kind: "Secret",
		type: dto.type || "Opaque",
		metadata: {
			name: dto.name,
			namespace: dto.namespace,
			labels: dto.labels,
			annotations: dto.annotations,
		},
		data: dto.data || {}, // Already base64 encoded
	};
	return YAML.stringify(manifest);
};
