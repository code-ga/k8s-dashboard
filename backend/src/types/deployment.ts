import { Type, type Static } from "@sinclair/typebox";
import { dbSchemaTypes } from "../database/type";
import {
	PvcVolumeRefSchema,
	EmptyDirVolumeRefSchema,
	ConfigMapEnvFromRefSchema,
	ConfigMapEnvRefSchema,
	ConfigMapVolumeRefSchema,
	PortRefSchema,
	SecretEnvFromRefSchema,
	SecretEnvRefSchema,
	SecretVolumeRefSchema,
} from "../utils/resource-refs";

export const fullDeploymentSchema = Type.Object({
	...dbSchemaTypes.k8sDeployments,
	ports: Type.Array(
		Type.Object({
			containerPort: Type.Number(),
			name: Type.Optional(Type.String()),
		}),
	),
	configMapRefs: Type.Object({
		env: Type.Optional(
			Type.Array(
				Type.Object({
					configMapName: Type.String(),
					key: Type.String(),
					name: Type.String(),
				}),
			),
		),
		envFrom: Type.Optional(
			Type.Array(Type.Object({ configMapName: Type.String() })),
		),
		volumes: Type.Optional(
			Type.Array(
				Type.Object({
					configMapName: Type.String(),
					mountPath: Type.String(),
					name: Type.String(),
				}),
			),
		),
	}),
	secretRefs: Type.Object({
		env: Type.Optional(
			Type.Array(
				Type.Object({
					secretName: Type.String(),
					key: Type.String(),
					name: Type.String(),
				}),
			),
		),
		envFrom: Type.Optional(
			Type.Array(Type.Object({ secretName: Type.String() })),
		),
		volumes: Type.Optional(
			Type.Array(
				Type.Object({
					secretName: Type.String(),
					mountPath: Type.String(),
					name: Type.String(),
				}),
			),
		),
	}),
	pvcVolumes: Type.Optional(Type.Array(PvcVolumeRefSchema)),
	emptyDirVolumes: Type.Optional(Type.Array(EmptyDirVolumeRefSchema)),
});

export type TFullDeployment = Static<typeof fullDeploymentSchema>;

export const fullPodSchema = Type.Object({
	...dbSchemaTypes.k8sPods,
	ports: Type.Array(PortRefSchema),
	configMapRefs: Type.Object({
		env: Type.Optional(Type.Array(ConfigMapEnvRefSchema)),
		envFrom: Type.Optional(Type.Array(ConfigMapEnvFromRefSchema)),
		volumes: Type.Optional(Type.Array(ConfigMapVolumeRefSchema)),
	}),
	secretRefs: Type.Object({
		env: Type.Optional(Type.Array(SecretEnvRefSchema)),
		envFrom: Type.Optional(Type.Array(SecretEnvFromRefSchema)),
		volumes: Type.Optional(Type.Array(SecretVolumeRefSchema)),
	}),
	pvcVolumes: Type.Optional(Type.Array(PvcVolumeRefSchema)),
	emptyDirVolumes: Type.Optional(Type.Array(EmptyDirVolumeRefSchema)),
});
export type TFullPod = Static<typeof fullPodSchema>;
