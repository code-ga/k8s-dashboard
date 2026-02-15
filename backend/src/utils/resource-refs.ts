import { eq, and } from "drizzle-orm";
import { db } from "../database";
import { schema } from "../database/schema";
import type { PgTableWithColumns } from "drizzle-orm/pg-core";

// ==================== Type Definitions ====================

export interface PortRef {
	containerPort: number;
	name?: string;
}

export interface ConfigMapEnvRef {
	name: string;
	configMapName: string;
	key: string;
}

export interface ConfigMapEnvFromRef {
	configMapName: string;
	prefix?: string;
}

export interface ConfigMapVolumeItem {
	key: string;
	path: string;
}

export interface ConfigMapVolumeRef {
	name: string;
	configMapName: string;
	mountPath: string;
	items?: ConfigMapVolumeItem[];
}

export interface SecretEnvRef {
	name: string;
	secretName: string;
	key: string;
}

export interface SecretEnvFromRef {
	secretName: string;
	prefix?: string;
}

export interface SecretVolumeItem {
	key: string;
	path: string;
}

export interface SecretVolumeRef {
	name: string;
	secretName: string;
	mountPath: string;
	items?: SecretVolumeItem[];
}

export interface ResourceRefs {
	configMapRefs?: {
		env?: ConfigMapEnvRef[] | undefined;
		envFrom?: ConfigMapEnvFromRef[] | undefined;
		volumes?: ConfigMapVolumeRef[] | undefined;
	};
	secretRefs?: {
		env?: SecretEnvRef[] | undefined;
		envFrom?: SecretEnvFromRef[] | undefined;
		volumes?: SecretVolumeRef[] | undefined;
	};
}

// ==================== Pod Port Operations ====================

/**
 * Insert ports for a pod
 */
export async function insertPodPorts(
	ports: PortRef[],
	podId: number,
): Promise<void> {
	if (!ports || ports.length === 0) return;

	const values = ports.map((port) => ({
		podId,
		containerPort: port.containerPort,
		name: port.name || null,
	}));

	await db.insert(schema.podPorts).values(values);
}

/**
 * Fetch ports for a pod
 */
export async function fetchPodPorts(podId: number): Promise<PortRef[]> {
	const results = await db
		.select()
		.from(schema.podPorts)
		.where(eq(schema.podPorts.podId, podId));

	return results.map((row) => ({
		containerPort: row.containerPort,
		name: row.name || undefined,
	}));
}

/**
 * Delete all ports for a pod
 */
export async function deletePodPorts(podId: number): Promise<void> {
	await db.delete(schema.podPorts).where(eq(schema.podPorts.podId, podId));
}

// ==================== Deployment Port Operations ====================

/**
 * Insert ports for a deployment
 */
export async function insertDeploymentPorts(
	ports: PortRef[],
	deploymentId: number,
): Promise<void> {
	if (!ports || ports.length === 0) return;

	const values = ports.map((port) => ({
		deploymentId,
		containerPort: port.containerPort,
		name: port.name || null,
	}));

	await db.insert(schema.deploymentPorts).values(values);
}

/**
 * Fetch ports for a deployment
 */
export async function fetchDeploymentPorts(
	deploymentId: number,
): Promise<PortRef[]> {
	const results = await db
		.select()
		.from(schema.deploymentPorts)
		.where(eq(schema.deploymentPorts.deploymentId, deploymentId));

	return results.map((row) => ({
		containerPort: row.containerPort,
		name: row.name || undefined,
	}));
}

/**
 * Delete all ports for a deployment
 */
export async function deleteDeploymentPorts(
	deploymentId: number,
): Promise<void> {
	await db
		.delete(schema.deploymentPorts)
		.where(eq(schema.deploymentPorts.deploymentId, deploymentId));
}

// ==================== Pod ConfigMap Ref Operations ====================

/**
 * Insert ConfigMap references for a pod
 */
export async function insertPodConfigMapRefs(
	refs: ResourceRefs["configMapRefs"],
	podId: number,
): Promise<void> {
	if (!refs) return;

	// Insert env refs
	if (refs.env && refs.env.length > 0) {
		const envValues = refs.env.map((ref) => ({
			podId,
			envName: ref.name,
			configMapName: ref.configMapName,
			configMapKey: ref.key,
		}));

		await db.insert(schema.podConfigMapEnvRefs).values(envValues);
	}

	// Insert envFrom refs
	if (refs.envFrom && refs.envFrom.length > 0) {
		const envFromValues = refs.envFrom.map((ref) => ({
			podId,
			configMapName: ref.configMapName,
			prefix: ref.prefix || null,
		}));

		await db.insert(schema.podConfigMapEnvFromRefs).values(envFromValues);
	}

	// Insert volume refs
	if (refs.volumes && refs.volumes.length > 0) {
		for (const volume of refs.volumes) {
			// Insert volume ref
			const [volumeRef] = await db
				.insert(schema.podConfigMapVolumeRefs)
				.values({
					podId,
					volumeName: volume.name,
					configMapName: volume.configMapName,
					mountPath: volume.mountPath,
				})
				.returning();

			// Insert volume items if present
			if (volumeRef && volume.items && volume.items.length > 0) {
				const itemValues = volume.items.map((item) => ({
					volumeRefId: volumeRef.id,
					key: item.key,
					path: item.path,
				}));

				await db.insert(schema.podConfigMapVolumeItems).values(itemValues);
			}
		}
	}
}

/**
 * Fetch ConfigMap references for a pod
 */
export async function fetchPodConfigMapRefs(
	podId: number,
): Promise<ResourceRefs["configMapRefs"]> {
	// Fetch env refs
	const envRefs = await db
		.select()
		.from(schema.podConfigMapEnvRefs)
		.where(eq(schema.podConfigMapEnvRefs.podId, podId));

	// Fetch envFrom refs
	const envFromRefs = await db
		.select()
		.from(schema.podConfigMapEnvFromRefs)
		.where(eq(schema.podConfigMapEnvFromRefs.podId, podId));

	// Fetch volume refs with items
	const volumeRefs = await db
		.select()
		.from(schema.podConfigMapVolumeRefs)
		.where(eq(schema.podConfigMapVolumeRefs.podId, podId));

	const volumes: ConfigMapVolumeRef[] = [];
	for (const volRef of volumeRefs) {
		const items = await db
			.select()
			.from(schema.podConfigMapVolumeItems)
			.where(eq(schema.podConfigMapVolumeItems.volumeRefId, volRef.id));

		volumes.push({
			name: volRef.volumeName,
			configMapName: volRef.configMapName,
			mountPath: volRef.mountPath,
			items:
				items.length > 0
					? items.map((item) => ({ key: item.key, path: item.path }))
					: undefined,
		});
	}

	return {
		env: envRefs.map((ref) => ({
			name: ref.envName,
			configMapName: ref.configMapName,
			key: ref.configMapKey,
		})),
		envFrom: envFromRefs.map((ref) => ({
			configMapName: ref.configMapName,
			prefix: ref.prefix || undefined,
		})),
		volumes: volumes.length > 0 ? volumes : undefined,
	};
}

/**
 * Delete all ConfigMap references for a pod
 */
export async function deletePodConfigMapRefs(podId: number): Promise<void> {
	// Items cascade delete automatically via foreign key
	await db
		.delete(schema.podConfigMapEnvRefs)
		.where(eq(schema.podConfigMapEnvRefs.podId, podId));
	await db
		.delete(schema.podConfigMapEnvFromRefs)
		.where(eq(schema.podConfigMapEnvFromRefs.podId, podId));
	await db
		.delete(schema.podConfigMapVolumeRefs)
		.where(eq(schema.podConfigMapVolumeRefs.podId, podId));
}

// ==================== Deployment ConfigMap Ref Operations ====================

/**
 * Insert ConfigMap references for a deployment
 */
export async function insertDeploymentConfigMapRefs(
	refs: ResourceRefs["configMapRefs"],
	deploymentId: number,
): Promise<void> {
	if (!refs) return;

	// Insert env refs
	if (refs.env && refs.env.length > 0) {
		const envValues = refs.env.map((ref) => ({
			deploymentId,
			envName: ref.name,
			configMapName: ref.configMapName,
			configMapKey: ref.key,
		}));

		await db.insert(schema.deploymentConfigMapEnvRefs).values(envValues);
	}

	// Insert envFrom refs
	if (refs.envFrom && refs.envFrom.length > 0) {
		const envFromValues = refs.envFrom.map((ref) => ({
			deploymentId,
			configMapName: ref.configMapName,
			prefix: ref.prefix || null,
		}));

		await db
			.insert(schema.deploymentConfigMapEnvFromRefs)
			.values(envFromValues);
	}

	// Insert volume refs
	if (refs.volumes && refs.volumes.length > 0) {
		for (const volume of refs.volumes) {
			// Insert volume ref
			const [volumeRef] = await db
				.insert(schema.deploymentConfigMapVolumeRefs)
				.values({
					deploymentId,
					volumeName: volume.name,
					configMapName: volume.configMapName,
					mountPath: volume.mountPath,
				})
				.returning();

			// Insert volume items if present
			if (volumeRef && volume.items && volume.items.length > 0) {
				const itemValues = volume.items.map((item) => ({
					volumeRefId: volumeRef.id,
					key: item.key,
					path: item.path,
				}));

				await db
					.insert(schema.deploymentConfigMapVolumeItems)
					.values(itemValues);
			}
		}
	}
}

/**
 * Fetch ConfigMap references for a deployment
 */
export async function fetchDeploymentConfigMapRefs(
	deploymentId: number,
): Promise<ResourceRefs["configMapRefs"]> {
	// Fetch env refs
	const envRefs = await db
		.select()
		.from(schema.deploymentConfigMapEnvRefs)
		.where(eq(schema.deploymentConfigMapEnvRefs.deploymentId, deploymentId));

	// Fetch envFrom refs
	const envFromRefs = await db
		.select()
		.from(schema.deploymentConfigMapEnvFromRefs)
		.where(
			eq(schema.deploymentConfigMapEnvFromRefs.deploymentId, deploymentId),
		);

	// Fetch volume refs with items
	const volumeRefs = await db
		.select()
		.from(schema.deploymentConfigMapVolumeRefs)
		.where(eq(schema.deploymentConfigMapVolumeRefs.deploymentId, deploymentId));

	const volumes: ConfigMapVolumeRef[] = [];
	for (const volRef of volumeRefs) {
		const items = await db
			.select()
			.from(schema.deploymentConfigMapVolumeItems)
			.where(eq(schema.deploymentConfigMapVolumeItems.volumeRefId, volRef.id));

		volumes.push({
			name: volRef.volumeName,
			configMapName: volRef.configMapName,
			mountPath: volRef.mountPath,
			items:
				items.length > 0
					? items.map((item) => ({ key: item.key, path: item.path }))
					: undefined,
		});
	}

	return {
		env: envRefs.map((ref) => ({
			name: ref.envName,
			configMapName: ref.configMapName,
			key: ref.configMapKey,
		})),
		envFrom: envFromRefs.map((ref) => ({
			configMapName: ref.configMapName,
			prefix: ref.prefix || undefined,
		})),
		volumes: volumes.length > 0 ? volumes : undefined,
	};
}

/**
 * Delete all ConfigMap references for a deployment
 */
export async function deleteDeploymentConfigMapRefs(
	deploymentId: number,
): Promise<void> {
	await db
		.delete(schema.deploymentConfigMapEnvRefs)
		.where(eq(schema.deploymentConfigMapEnvRefs.deploymentId, deploymentId));
	await db
		.delete(schema.deploymentConfigMapEnvFromRefs)
		.where(
			eq(schema.deploymentConfigMapEnvFromRefs.deploymentId, deploymentId),
		);
	await db
		.delete(schema.deploymentConfigMapVolumeRefs)
		.where(eq(schema.deploymentConfigMapVolumeRefs.deploymentId, deploymentId));
}

// ==================== Pod Secret Ref Operations ====================

/**
 * Insert Secret references for a pod
 */
export async function insertPodSecretRefs(
	refs: ResourceRefs["secretRefs"],
	podId: number,
): Promise<void> {
	if (!refs) return;

	// Insert env refs
	if (refs.env && refs.env.length > 0) {
		const envValues = refs.env.map((ref) => ({
			podId,
			envName: ref.name,
			secretName: ref.secretName,
			secretKey: ref.key,
		}));

		await db.insert(schema.podSecretEnvRefs).values(envValues);
	}

	// Insert envFrom refs
	if (refs.envFrom && refs.envFrom.length > 0) {
		const envFromValues = refs.envFrom.map((ref) => ({
			podId,
			secretName: ref.secretName,
			prefix: ref.prefix || null,
		}));

		await db.insert(schema.podSecretEnvFromRefs).values(envFromValues);
	}

	// Insert volume refs
	if (refs.volumes && refs.volumes.length > 0) {
		for (const volume of refs.volumes) {
			// Insert volume ref
			const [volumeRef] = await db
				.insert(schema.podSecretVolumeRefs)
				.values({
					podId,
					volumeName: volume.name,
					secretName: volume.secretName,
					mountPath: volume.mountPath,
				})
				.returning();

			// Insert volume items if present
			if (volumeRef && volume.items && volume.items.length > 0) {
				const itemValues = volume.items.map((item) => ({
					volumeRefId: volumeRef.id,
					key: item.key,
					path: item.path,
				}));

				await db.insert(schema.podSecretVolumeItems).values(itemValues);
			}
		}
	}
}

/**
 * Fetch Secret references for a pod
 */
export async function fetchPodSecretRefs(
	podId: number,
): Promise<ResourceRefs["secretRefs"]> {
	// Fetch env refs
	const envRefs = await db
		.select()
		.from(schema.podSecretEnvRefs)
		.where(eq(schema.podSecretEnvRefs.podId, podId));

	// Fetch envFrom refs
	const envFromRefs = await db
		.select()
		.from(schema.podSecretEnvFromRefs)
		.where(eq(schema.podSecretEnvFromRefs.podId, podId));

	// Fetch volume refs with items
	const volumeRefs = await db
		.select()
		.from(schema.podSecretVolumeRefs)
		.where(eq(schema.podSecretVolumeRefs.podId, podId));

	const volumes: SecretVolumeRef[] = [];
	for (const volRef of volumeRefs) {
		const items = await db
			.select()
			.from(schema.podSecretVolumeItems)
			.where(eq(schema.podSecretVolumeItems.volumeRefId, volRef.id));

		volumes.push({
			name: volRef.volumeName,
			secretName: volRef.secretName,
			mountPath: volRef.mountPath,
			items:
				items.length > 0
					? items.map((item) => ({ key: item.key, path: item.path }))
					: undefined,
		});
	}

	return {
		env: envRefs.map((ref) => ({
			name: ref.envName,
			secretName: ref.secretName,
			key: ref.secretKey,
		})),
		envFrom: envFromRefs.map((ref) => ({
			secretName: ref.secretName,
			prefix: ref.prefix || undefined,
		})),
		volumes: volumes.length > 0 ? volumes : undefined,
	};
}

/**
 * Delete all Secret references for a pod
 */
export async function deletePodSecretRefs(podId: number): Promise<void> {
	await db
		.delete(schema.podSecretEnvRefs)
		.where(eq(schema.podSecretEnvRefs.podId, podId));
	await db
		.delete(schema.podSecretEnvFromRefs)
		.where(eq(schema.podSecretEnvFromRefs.podId, podId));
	await db
		.delete(schema.podSecretVolumeRefs)
		.where(eq(schema.podSecretVolumeRefs.podId, podId));
}

// ==================== Deployment Secret Ref Operations ====================

/**
 * Insert Secret references for a deployment
 */
export async function insertDeploymentSecretRefs(
	refs: ResourceRefs["secretRefs"],
	deploymentId: number,
): Promise<void> {
	if (!refs) return;

	// Insert env refs
	if (refs.env && refs.env.length > 0) {
		const envValues = refs.env.map((ref) => ({
			deploymentId,
			envName: ref.name,
			secretName: ref.secretName,
			secretKey: ref.key,
		}));

		await db.insert(schema.deploymentSecretEnvRefs).values(envValues);
	}

	// Insert envFrom refs
	if (refs.envFrom && refs.envFrom.length > 0) {
		const envFromValues = refs.envFrom.map((ref) => ({
			deploymentId,
			secretName: ref.secretName,
			prefix: ref.prefix || null,
		}));

		await db.insert(schema.deploymentSecretEnvFromRefs).values(envFromValues);
	}

	// Insert volume refs
	if (refs.volumes && refs.volumes.length > 0) {
		for (const volume of refs.volumes) {
			// Insert volume ref
			const [volumeRef] = await db
				.insert(schema.deploymentSecretVolumeRefs)
				.values({
					deploymentId,
					volumeName: volume.name,
					secretName: volume.secretName,
					mountPath: volume.mountPath,
				})
				.returning();

			// Insert volume items if present
			if (volumeRef && volume.items && volume.items.length > 0) {
				const itemValues = volume.items.map((item) => ({
					volumeRefId: volumeRef.id,
					key: item.key,
					path: item.path,
				}));

				await db.insert(schema.deploymentSecretVolumeItems).values(itemValues);
			}
		}
	}
}

/**
 * Fetch Secret references for a deployment
 */
export async function fetchDeploymentSecretRefs(
	deploymentId: number,
): Promise<ResourceRefs["secretRefs"]> {
	// Fetch env refs
	const envRefs = await db
		.select()
		.from(schema.deploymentSecretEnvRefs)
		.where(eq(schema.deploymentSecretEnvRefs.deploymentId, deploymentId));

	// Fetch envFrom refs
	const envFromRefs = await db
		.select()
		.from(schema.deploymentSecretEnvFromRefs)
		.where(eq(schema.deploymentSecretEnvFromRefs.deploymentId, deploymentId));

	// Fetch volume refs with items
	const volumeRefs = await db
		.select()
		.from(schema.deploymentSecretVolumeRefs)
		.where(eq(schema.deploymentSecretVolumeRefs.deploymentId, deploymentId));

	const volumes: SecretVolumeRef[] = [];
	for (const volRef of volumeRefs) {
		const items = await db
			.select()
			.from(schema.deploymentSecretVolumeItems)
			.where(eq(schema.deploymentSecretVolumeItems.volumeRefId, volRef.id));

		volumes.push({
			name: volRef.volumeName,
			secretName: volRef.secretName,
			mountPath: volRef.mountPath,
			items:
				items.length > 0
					? items.map((item) => ({ key: item.key, path: item.path }))
					: undefined,
		});
	}

	return {
		env: envRefs.map((ref) => ({
			name: ref.envName,
			secretName: ref.secretName,
			key: ref.secretKey,
		})),
		envFrom: envFromRefs.map((ref) => ({
			secretName: ref.secretName,
			prefix: ref.prefix || undefined,
		})),
		volumes: volumes.length > 0 ? volumes : undefined,
	};
}

/**
 * Delete all Secret references for a deployment
 */
export async function deleteDeploymentSecretRefs(
	deploymentId: number,
): Promise<void> {
	await db
		.delete(schema.deploymentSecretEnvRefs)
		.where(eq(schema.deploymentSecretEnvRefs.deploymentId, deploymentId));
	await db
		.delete(schema.deploymentSecretEnvFromRefs)
		.where(eq(schema.deploymentSecretEnvFromRefs.deploymentId, deploymentId));
	await db
		.delete(schema.deploymentSecretVolumeRefs)
		.where(eq(schema.deploymentSecretVolumeRefs.deploymentId, deploymentId));
}

// ==================== Combined Operations ====================

/**
 * Insert all resource references for a pod
 */
export async function insertAllPodResourceRefs(
	podId: number,
	ports: PortRef[],
	refs: ResourceRefs,
): Promise<void> {
	await db.transaction(async () => {
		if (ports && ports.length > 0) {
			await insertPodPorts(ports, podId);
		}

		if (refs.configMapRefs) {
			await insertPodConfigMapRefs(refs.configMapRefs, podId);
		}

		if (refs.secretRefs) {
			await insertPodSecretRefs(refs.secretRefs, podId);
		}
	});
}

/**
 * Insert all resource references for a deployment
 */
export async function insertAllDeploymentResourceRefs(
	deploymentId: number,
	ports: PortRef[],
	refs: ResourceRefs,
): Promise<void> {
	await db.transaction(async () => {
		if (ports && ports.length > 0) {
			await insertDeploymentPorts(ports, deploymentId);
		}

		if (refs.configMapRefs) {
			await insertDeploymentConfigMapRefs(refs.configMapRefs, deploymentId);
		}

		if (refs.secretRefs) {
			await insertDeploymentSecretRefs(refs.secretRefs, deploymentId);
		}
	});
}

/**
 * Fetch all resource references for a pod
 */
export async function fetchAllPodResourceRefs(
	podId: number,
): Promise<{ ports: PortRef[]; refs: ResourceRefs }> {
	const [ports, configMapRefs, secretRefs] = await Promise.all([
		fetchPodPorts(podId),
		fetchPodConfigMapRefs(podId),
		fetchPodSecretRefs(podId),
	]);

	return {
		ports,
		refs: {
			configMapRefs,
			secretRefs,
		},
	};
}

/**
 * Fetch all resource references for a deployment
 */
export async function fetchAllDeploymentResourceRefs(
	deploymentId: number,
): Promise<{ ports: PortRef[]; refs: ResourceRefs }> {
	const [ports, configMapRefs, secretRefs] = await Promise.all([
		fetchDeploymentPorts(deploymentId),
		fetchDeploymentConfigMapRefs(deploymentId),
		fetchDeploymentSecretRefs(deploymentId),
	]);

	return {
		ports,
		refs: {
			configMapRefs,
			secretRefs,
		},
	};
}

/**
 * Delete all resource references for a pod
 */
export async function deleteAllPodResourceRefs(podId: number): Promise<void> {
	await Promise.all([
		deletePodPorts(podId),
		deletePodConfigMapRefs(podId),
		deletePodSecretRefs(podId),
	]);
}

/**
 * Delete all resource references for a deployment
 */
export async function deleteAllDeploymentResourceRefs(
	deploymentId: number,
): Promise<void> {
	await Promise.all([
		deleteDeploymentPorts(deploymentId),
		deleteDeploymentConfigMapRefs(deploymentId),
		deleteDeploymentSecretRefs(deploymentId),
	]);
}

/**
 * Update all resource references for a pod (delete old, insert new)
 */
export async function updateAllPodResourceRefs(
	podId: number,
	ports?: PortRef[],
	refs?: ResourceRefs,
): Promise<void> {
	await db.transaction(async () => {
		// Delete existing refs
		await deleteAllPodResourceRefs(podId);

		// Insert new refs
		if (ports) {
			await insertPodPorts(ports, podId);
		}

		if (refs) {
			if (refs.configMapRefs) {
				await insertPodConfigMapRefs(refs.configMapRefs, podId);
			}

			if (refs.secretRefs) {
				await insertPodSecretRefs(refs.secretRefs, podId);
			}
		}
	});
}

/**
 * Update all resource references for a deployment (delete old, insert new)
 */
export async function updateAllDeploymentResourceRefs(
	deploymentId: number,
	ports?: PortRef[],
	refs?: ResourceRefs,
): Promise<void> {
	await db.transaction(async () => {
		// Delete existing refs
		await deleteAllDeploymentResourceRefs(deploymentId);

		// Insert new refs
		if (ports) {
			await insertDeploymentPorts(ports, deploymentId);
		}

		if (refs) {
			if (refs.configMapRefs) {
				await insertDeploymentConfigMapRefs(refs.configMapRefs, deploymentId);
			}

			if (refs.secretRefs) {
				await insertDeploymentSecretRefs(refs.secretRefs, deploymentId);
			}
		}
	});
}

// ==================== Transform Functions ====================

/**
 * Transform normalized structure to JSONB format (for backwards compatibility)
 */
export function transformToJsonbFormat(refs: ResourceRefs): {
	configMapRefs: any;
	secretRefs: any;
} {
	return {
		configMapRefs: {
			env: refs.configMapRefs?.env || [],
			envFrom: refs.configMapRefs?.envFrom || [],
			volumes: refs.configMapRefs?.volumes || [],
		},
		secretRefs: {
			env: refs.secretRefs?.env || [],
			envFrom: refs.secretRefs?.envFrom || [],
			volumes: refs.secretRefs?.volumes || [],
		},
	};
}

/**
 * Transform JSONB format to normalized structure (for migration)
 */
export function transformFromJsonbFormat(data: {
	configMapRefs?: any;
	secretRefs?: any;
}): ResourceRefs {
	return {
		configMapRefs: data.configMapRefs
			? {
					env: data.configMapRefs.env || [],
					envFrom: data.configMapRefs.envFrom || [],
					volumes: data.configMapRefs.volumes || [],
				}
			: undefined,
		secretRefs: data.secretRefs
			? {
					env: data.secretRefs.env || [],
					envFrom: data.secretRefs.envFrom || [],
					volumes: data.secretRefs.volumes || [],
				}
			: undefined,
	};
}
