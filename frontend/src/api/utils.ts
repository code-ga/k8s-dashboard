import type { EnvVar } from "@/components/shared/env-editor";
import type {
	IConfigMapEnvFromRef,
	IConfigMapEnvRef,
	ISecretEnvFromRef,
	ISecretEnvRef,
} from "@/components/shared/refs-editor";
import type { databaseTypes, SchemaStatic } from "@/lib/api";
import { logger } from "@/lib/logger";
import type {
	IEmptyDirVolumeMount,
	IPvcVolumeMount,
} from "../components/shared/volume-mount-editor";

export type Pod = SchemaStatic<databaseTypes.databaseTypes["k8sPods"]>;
export type Deployment = SchemaStatic<
	databaseTypes.databaseTypes["k8sDeployments"]
>;

export function parseEnvVariables(
	envVariables: string | null | undefined,
): EnvVar[] {
	if (!envVariables) return [];

	try {
		const parsed = JSON.parse(envVariables);
		if (Array.isArray(parsed)) {
			return parsed.map((v) => ({
				...v,
				type: v.valueFrom?.fieldRef ? "fieldRef" : "text",
			}));
		}
		// Backward compatibility
		return Object.entries(parsed as Record<string, string>).map(
			([name, value]) => ({ name, value, type: "text" as const }),
		);
	} catch (e) {
		logger.error("Failed to parse env variables", e);
		return [];
	}
}

export function parseLabels(
	labels: string | null | undefined,
): Array<{ name: string; value: string }> {
	if (!labels) return [];

	try {
		const parsed = JSON.parse(labels);
		return Object.entries(parsed).map(([name, value]) => ({
			name,
			value: String(value),
		}));
	} catch {
		return [];
	}
}

export function parseResourceConfig(config: any): {
	image: string;
	command: string[];
	args: string[];
	envVars: EnvVar[];
	ports: Array<{ containerPort: number; name?: string }>;
	cpuRequest: string;
	cpuLimit: string;
	memoryRequest: string;
	memoryLimit: string;
	labels: Array<{ name: string; value: string }>;
	configMapEnvRefs: IConfigMapEnvRef[];
	configMapEnvFromRefs: IConfigMapEnvFromRef[];
	secretEnvRefs: ISecretEnvRef[];
	secretEnvFromRefs: ISecretEnvFromRef[];
	pvcVolumes: IPvcVolumeMount[];
	emptyDirVolumes: IEmptyDirVolumeMount[];
} {
	return {
		image: config.dockerImage || "",
		command: config.command ? config.command.split(" ") : [],
		args: config.args ? config.args.split(" ") : [],
		envVars: parseEnvVariables(config.envVariables),
		ports: config.ports || [],
		cpuRequest: `${config.cpuRequest}m`,
		cpuLimit: `${config.cpuLimit}m`,
		memoryRequest: `${config.memoryRequest}Mi`,
		memoryLimit: `${config.memoryLimit}Mi`,
		labels: parseLabels(config.labels),
		configMapEnvRefs: config.configMapRefs?.env || [],
		configMapEnvFromRefs: config.configMapRefs?.envFrom || [],
		secretEnvRefs: config.secretRefs?.env || [],
		secretEnvFromRefs: config.secretRefs?.envFrom || [],
		pvcVolumes: config.pvcVolumes || [],
		emptyDirVolumes: config.emptyDirVolumes || [],
	};
}

export function buildEnvPayload(
	envVars: Array<{
		name: string;
		value?: string;
		valueFrom?: any;
		type?: string;
	}>,
): Array<{ name: string; value?: string; valueFrom?: any }> {
	return envVars
		.filter((v) => v.name)
		.map((v) => {
			if (v.type === "fieldRef" || (!v.type && v.valueFrom?.fieldRef)) {
				return { name: v.name, valueFrom: v.valueFrom };
			}
			return { name: v.name, value: v.value };
		});
}

export function buildLabelsPayload(
	labels: Array<{ name: string; value?: string }>,
): Record<string, string> {
	const labelsMap: Record<string, string> = {};
	for (const l of labels) {
		if (l.name && l.value) labelsMap[l.name] = l.value;
	}
	return labelsMap;
}
