import {
	and,
	eq,
	type InferInsertModel,
	inArray,
	isNull,
	notInArray,
	or,
} from "drizzle-orm";
import YAML from "yaml";
import type { Heartbeat } from "../../pb-generated/agent-backend/websocket"; // Check imports carefully
import { Command_CommandType } from "../../pb-generated/agent-backend/websocket";
import { db } from "../database";
import {
	clusterAgent,
	gatewayPorts,
	k8sCluster,
	k8sClusterNode,
	k8sConfigMaps,
	k8sDeployments,
	k8sIngresses,
	k8sPersistentVolumeClaims,
	k8sPersistentVolumes,
	k8sPods,
	k8sSecrets,
	k8sStorageClasses,
	profile,
	schema,
} from "../database/schema";
import { decrypt, encrypt } from "../utils/crypto";
import { decryptEnvVars } from "../utils/env-utils";
import {
	generateDeploymentManifest,
	generateIngressRouteManifest,
	generatePodManifest,
} from "../utils/k8s-manifest";
import { logger } from "../utils/logger";
import {
	deleteDeploymentPorts,
	deletePodPorts,
	insertDeploymentPorts,
	insertPodPorts,
	type PortRef,
} from "../utils/resource-refs";
import type { AgentManager } from "./agentManager";

export class AgentService {
	// ─── Helpers ──────────────────────────────────────────────────────────────

	private async findDefaultOwner() {
		const profiles = await db
			.select()
			.from(profile)
			.where(eq(profile.isSystemDefault, true))
			.limit(1);

		return profiles[0];
	}

	private buildDeploymentManifest(
		dbDep: typeof k8sDeployments.$inferSelect,
		envVars?: Array<any>,
	) {
		return generateDeploymentManifest({
			name: dbDep.name,
			namespace: dbDep.namespace,
			image: dbDep.dockerImage || "",
			replicas: dbDep.replicas,
			labels: dbDep.labels ? JSON.parse(dbDep.labels) : undefined,
			selector: dbDep.selector ? JSON.parse(dbDep.selector) : undefined,
			ports: dbDep.ports?.data,
			annotations: dbDep.annotations,
			env: envVars,
			command: dbDep.command ? dbDep.command.split(" ") : undefined,
			args: dbDep.args ? dbDep.args.split(" ") : undefined,
			resources: {
				requests: {
					cpu: `${dbDep.cpuRequest}m`,
					memory: `${dbDep.memoryRequest}Mi`,
				},
				limits: {
					cpu: `${dbDep.cpuLimit}m`,
					memory: `${dbDep.memoryLimit}Mi`,
				},
			},
		});
	}

	private buildPodManifest(
		dbPod: typeof k8sPods.$inferSelect,
		envVars?: Array<any>,
	) {
		return generatePodManifest({
			name: dbPod.name,
			namespace: dbPod.namespace,
			image: dbPod.dockerImage,
			command: dbPod.command ? dbPod.command.split(" ") : undefined,
			args: dbPod.args ? dbPod.args.split(" ") : undefined,
			annotations: dbPod.annotations,
			labels:
				dbPod.labels && dbPod.labels !== ""
					? JSON.parse(dbPod.labels)
					: undefined,
			resources: {
				requests: {
					cpu: `${dbPod.cpuRequest}m`,
					memory: `${dbPod.memoryRequest}Mi`,
				},
				limits: {
					cpu: `${dbPod.cpuLimit}m`,
					memory: `${dbPod.memoryLimit}Mi`,
				},
			},
			env: envVars,
		});
	}

	// ─── Phase 1: Sync heartbeat → DB ─────────────────────────────────────────

	private async syncNodes(
		clusterId: number,
		nodes: Heartbeat["nodes"],
	): Promise<void> {
		try {
			for (const node of nodes) {
				let existingNode = await db
					.select()
					.from(k8sClusterNode)
					.where(
						and(
							eq(k8sClusterNode.clusterId, clusterId),
							eq(k8sClusterNode.k8sUid, node.uid),
						),
					);

				if (existingNode.length === 0) {
					existingNode = await db
						.select()
						.from(k8sClusterNode)
						.where(
							and(
								eq(k8sClusterNode.clusterId, clusterId),
								eq(k8sClusterNode.name, node.name),
							),
						);
				}

				const nodeData: InferInsertModel<typeof k8sClusterNode> = {
					clusterId,
					name: node.name,
					cpuUsage: Number(node.cpuUsage),
					ramUsage: Number(node.ramUsage),
					cpuCapacity: Number(node.cpuCapacity),
					ramCapacity: Number(node.ramCapacity),
					labels: JSON.stringify(node.labels),
					k8sUid: node.uid,
					status: node.status || "Unknown",
					roles: node.roles || [],
					updatedAt: new Date(),
					annotations: node.annotations || {},
					resourceConfig: node.resourceConfig || "",
				};

				const existingRecord = existingNode[0];
				if (existingRecord) {
					await db
						.update(k8sClusterNode)
						.set(nodeData)
						.where(eq(k8sClusterNode.id, existingRecord.id));
				} else {
					await db
						.insert(k8sClusterNode)
						.values({ ...nodeData, autoCreated: true });
				}
			}

			// Cleanup: remove auto-created nodes no longer present
			const heartbeatUids = nodes
				.map((n) => n.uid)
				.filter((uid): uid is string => !!uid);
			const deleteFilter = [
				eq(k8sClusterNode.clusterId, clusterId),
				eq(k8sClusterNode.autoCreated, true),
			];
			if (heartbeatUids.length > 0) {
				deleteFilter.push(notInArray(k8sClusterNode.k8sUid, heartbeatUids));
			}
			await db.delete(k8sClusterNode).where(and(...deleteFilter));
		} catch (error) {
			logger.error("Failed to sync nodes", { clusterId, error });
			throw error;
		}
	}

	private async syncDeployments(
		clusterId: number,
		deployments: Heartbeat["deployments"],
	): Promise<void> {
		try {
			for (const dep of deployments) {
				let existing = await db
					.select()
					.from(k8sDeployments)
					.where(
						and(
							eq(k8sDeployments.clusterId, clusterId),
							eq(k8sDeployments.k8sUid, dep.uid),
						),
					);

				if (existing.length === 0) {
					existing = await db
						.select()
						.from(k8sDeployments)
						.where(
							and(
								eq(k8sDeployments.clusterId, clusterId),
								eq(k8sDeployments.name, dep.name),
								eq(k8sDeployments.namespace, dep.namespace),
							),
						);
				}

				const depData: Omit<
					InferInsertModel<typeof k8sDeployments>,
					"ownerId"
				> = {
					clusterId,
					name: dep.name,
					namespace: dep.namespace,
					replicas: dep.replicas,
					availableReplicas: dep.availableReplicas,
					unavailableReplicas: dep.unavailableReplicas,
					dockerImage: dep.dockerImage,
					labels: JSON.stringify(dep.labels),
					selector: JSON.stringify(dep.selector),
					k8sUid: dep.uid,
					command: dep.command,
					args: dep.args,
					envVariables: dep.envVariables,
					cpuRequest: Number(dep.cpuRequest),
					cpuLimit: Number(dep.cpuLimit),
					memoryRequest: Number(dep.memoryRequest),
					memoryLimit: Number(dep.memoryLimit),
					updatedAt: new Date(),
					annotations: dep.annotations || {},
					templateAnnotations: dep.templateAnnotations || {},
					resourceConfig: dep.resourceConfig || "",
				};

				const existingRecord = existing[0];
				if (existingRecord) {
					await db
						.update(k8sDeployments)
						.set({
							availableReplicas: dep.availableReplicas,
							unavailableReplicas: dep.unavailableReplicas,
							k8sUid: dep.uid,
							updatedAt: new Date(),
						})
						.where(eq(k8sDeployments.id, existingRecord.id));

					const deploymentId = existingRecord.id;
					await deleteDeploymentPorts(deploymentId);
					if (dep.ports && dep.ports.length > 0) {
						const ports: PortRef[] = dep.ports.map((p) => ({
							containerPort: p.containerPort,
							name: p.name,
						}));
						await insertDeploymentPorts(ports, deploymentId);
					}
				} else {
					const defaultOwner = await this.findDefaultOwner();
					if (!defaultOwner) throw new Error("Default account not found");

					const [newDep] = await db
						.insert(k8sDeployments)
						.values({
							...depData,
							ownerId: defaultOwner.id,
							autoCreated: true,
						})
						.returning();

					if (newDep && dep.ports && dep.ports.length > 0) {
						const ports: PortRef[] = dep.ports.map((p) => ({
							containerPort: p.containerPort,
							name: p.name,
						}));
						await insertDeploymentPorts(ports, newDep.id);
					}
				}
			}

			// Cleanup: remove auto-created deployments no longer present
			const heartbeatUids = deployments
				.map((d) => d.uid)
				.filter((uid): uid is string => !!uid);
			const deleteFilter = [
				eq(k8sDeployments.clusterId, clusterId),
				eq(k8sDeployments.autoCreated, true),
			];
			if (heartbeatUids.length > 0) {
				deleteFilter.push(notInArray(k8sDeployments.k8sUid, heartbeatUids));
			}
			logger.info("Deleting deployments", { heartbeatUids });
			await db.delete(k8sDeployments).where(and(...deleteFilter));
		} catch (error) {
			logger.error("Failed to sync deployments", { clusterId, error });
			throw error;
		}
	}

	private async syncPods(
		clusterId: number,
		pods: Heartbeat["pods"],
	): Promise<void> {
		try {
			const defaultOwner = await this.findDefaultOwner();
			if (!defaultOwner) {
				logger.error("Default owner not found for pod syncing", {
					clusterId,
				});
				return;
			}

			for (const pod of pods) {
				const nodeResult = await db
					.select()
					.from(k8sClusterNode)
					.where(
						and(
							eq(k8sClusterNode.clusterId, clusterId),
							eq(k8sClusterNode.name, pod.nodeName),
						),
					);

				if (nodeResult.length === 0 || !nodeResult[0]) {
					logger.error(`Node ${pod.nodeName} not found for pod ${pod.name}`, {
						clusterId,
						podName: pod.name,
						nodeName: pod.nodeName,
					});
					continue;
				}
				const node = nodeResult[0];

				let existingPodResult = await db
					.select()
					.from(k8sPods)
					.where(
						and(eq(k8sPods.clusterId, clusterId), eq(k8sPods.k8sUid, pod.uid)),
					);

				if (existingPodResult.length === 0) {
					existingPodResult = await db
						.select()
						.from(k8sPods)
						.where(
							and(
								eq(k8sPods.clusterId, clusterId),
								eq(k8sPods.name, pod.name),
								eq(k8sPods.namespace, pod.namespace),
							),
						);
				}

				let deploymentId: number | null = null;
				let ownerId = defaultOwner.id;

				const depName = pod.annotations?.["k8s-dashboard/deployment-name"];
				if (depName) {
					const depResult = await db
						.select()
						.from(k8sDeployments)
						.where(
							and(
								eq(k8sDeployments.clusterId, clusterId),
								eq(k8sDeployments.name, depName),
								eq(k8sDeployments.namespace, pod.namespace),
							),
						)
						.limit(1);
					const dep = depResult[0];
					if (dep) {
						deploymentId = dep.id;
						ownerId = dep.ownerId;
					}
				}

				const podData: InferInsertModel<typeof k8sPods> = {
					clusterId,
					deploymentId,
					nodeId: node.id,
					ownerId,
					name: pod.name,
					namespace: pod.namespace,
					dockerImage: pod.dockerImage,
					cpuRequest: Number(pod.cpuRequest),
					cpuLimit: Number(pod.cpuLimit),
					memoryRequest: Number(pod.memoryRequest),
					memoryLimit: Number(pod.memoryLimit),
					command: pod.command,
					args: pod.args,
					envVariables: pod.envVariables,
					labels: JSON.stringify(pod.labels),
					k8sUid: pod.uid,
					status: pod.status || "Unknown",
					cpuUsage: Number(pod.cpuUsage),
					memoryUsage: Number(pod.ramUsage),
					updatedAt: new Date(),
					annotations: pod.annotations || {},
					resourceConfig: pod.resourceConfig || "",
				};

				const existingPod = existingPodResult[0];
				if (existingPod) {
					const newStatus =
						existingPod.status === "Terminating"
							? "Terminating"
							: pod.status || "Unknown";

					await db
						.update(k8sPods)
						.set({
							nodeId: node.id,
							status: newStatus,
							cpuUsage: Number(pod.cpuUsage),
							memoryUsage: Number(pod.ramUsage),
							k8sUid: pod.uid,
							updatedAt: new Date(),
							deploymentId,
							ownerId,
						})
						.where(eq(k8sPods.id, existingPod.id));

					const podId = existingPod.id;
					await deletePodPorts(podId);
					if (pod.ports && pod.ports.length > 0) {
						const ports: PortRef[] = pod.ports.map((p) => ({
							containerPort: p.containerPort,
							name: p.name,
						}));
						await insertPodPorts(ports, podId);
					}
				} else {
					const [newPod] = await db
						.insert(k8sPods)
						.values({ ...podData, autoCreated: true })
						.returning();

					if (newPod && pod.ports && pod.ports.length > 0) {
						const ports: PortRef[] = pod.ports.map((p) => ({
							containerPort: p.containerPort,
							name: p.name,
						}));
						await insertPodPorts(ports, newPod.id);
					}
				}
			}

			// Cleanup: remove auto-created pods no longer present
			const heartbeatUids = pods
				.map((p) => p.uid)
				.filter((uid): uid is string => !!uid);
			const deleteFilter = [
				eq(k8sPods.clusterId, clusterId),
				eq(k8sPods.autoCreated, true),
			];
			if (heartbeatUids.length > 0) {
				deleteFilter.push(notInArray(k8sPods.k8sUid, heartbeatUids));
			}
			logger.info("Deleting pods", { heartbeatUids });
			await db.delete(k8sPods).where(and(...deleteFilter));
		} catch (error) {
			logger.error("Failed to sync pods", { clusterId, error });
			throw error;
		}
	}

	private async syncServices(
		clusterId: number,
		services: Heartbeat["services"],
	): Promise<void> {
		try {
			for (const svc of services) {
				let existingSvc = await db
					.select()
					.from(schema.k8sServices)
					.where(
						and(
							eq(schema.k8sServices.clusterId, clusterId),
							eq(schema.k8sServices.k8sUid, svc.uid),
						),
					);

				if (existingSvc.length === 0) {
					existingSvc = await db
						.select()
						.from(schema.k8sServices)
						.where(
							and(
								eq(schema.k8sServices.clusterId, clusterId),
								eq(schema.k8sServices.name, svc.name),
								eq(schema.k8sServices.namespace, svc.namespace),
							),
						);
				}

				const svcData: InferInsertModel<typeof schema.k8sServices> = {
					clusterId,
					name: svc.name,
					namespace: svc.namespace,
					type: svc.type,
					clusterIp: svc.clusterIp,
					selector: JSON.stringify(svc.selector),
					k8sUid: svc.uid,
					labels: JSON.stringify(svc.labels),
					ports: { data: svc.ports },
					updatedAt: new Date(),
					annotations: svc.annotations || {},
					resourceConfig: svc.resourceConfig || "",
				};

				const existingRecord = existingSvc[0];
				if (existingRecord) {
					await db
						.update(schema.k8sServices)
						.set(svcData)
						.where(eq(schema.k8sServices.id, existingRecord.id));
				} else {
					const defaultOwner = await this.findDefaultOwner();
					if (!defaultOwner) {
						logger.error("Default owner not found for service syncing", {
							clusterId,
							svcName: svc.name,
						});
					} else {
						svcData.ownerId = defaultOwner.id;
					}
					await db
						.insert(schema.k8sServices)
						.values({ ...svcData, autoCreated: true });
				}
			}

			// Cleanup: remove auto-created services no longer present
			const heartbeatUids = services
				.map((s) => s.uid)
				.filter((uid): uid is string => !!uid);
			const staleServiceFilter = [
				eq(schema.k8sServices.clusterId, clusterId),
				eq(schema.k8sServices.autoCreated, true),
			];
			if (heartbeatUids.length > 0) {
				staleServiceFilter.push(
					notInArray(schema.k8sServices.k8sUid, heartbeatUids),
				);
			}

			// Find the stale services so we can clean up referencing ingresses first
			const staleServices = await db
				.select({ id: schema.k8sServices.id })
				.from(schema.k8sServices)
				.where(and(...staleServiceFilter));

			if (staleServices.length > 0) {
				const staleServiceIds = staleServices.map((s) => s.id);

				// Delete auto-created ingresses pointing to stale services
				// (they're orphaned and would fail the NOT-NULL FK cascade otherwise)
				await db
					.delete(k8sIngresses)
					.where(
						and(
							eq(k8sIngresses.clusterId, clusterId),
							eq(k8sIngresses.autoCreated, true),
							inArray(k8sIngresses.serviceId, staleServiceIds),
						),
					);

				// Null-out serviceId on user-created ingresses (FK set-null semantics)
				await db
					.update(k8sIngresses)
					.set({ serviceId: null })
					.where(
						and(
							eq(k8sIngresses.clusterId, clusterId),
							inArray(k8sIngresses.serviceId, staleServiceIds),
						),
					);
				logger.info("Deleting ingresses", { staleServiceIds });
				// Now safe to delete the stale services
				await db.delete(schema.k8sServices).where(and(...staleServiceFilter));
			}
		} catch (error) {
			logger.error("Failed to sync services", { clusterId, error });
			throw error;
		}
	}

	private async syncConfigMaps(
		clusterId: number,
		configMaps: Heartbeat["configMaps"],
	): Promise<void> {
		const defaultOwner = await this.findDefaultOwner();

		for (const cm of configMaps) {
			let existing = await db
				.select()
				.from(k8sConfigMaps)
				.where(
					and(
						eq(k8sConfigMaps.clusterId, clusterId),
						eq(k8sConfigMaps.k8sUid, cm.uid),
					),
				);

			if (existing.length === 0) {
				existing = await db
					.select()
					.from(k8sConfigMaps)
					.where(
						and(
							eq(k8sConfigMaps.clusterId, clusterId),
							eq(k8sConfigMaps.name, cm.name),
							eq(k8sConfigMaps.namespace, cm.namespace),
						),
					);
			}

			const encryptedData = encrypt(JSON.stringify(cm.data));

			let encryptedBinaryData = null;
			if (cm.binaryData && Object.keys(cm.binaryData).length > 0) {
				const binData: Record<string, string> = {};
				for (const [key, val] of Object.entries(cm.binaryData)) {
					binData[key] = Buffer.from(val).toString("base64");
				}
				encryptedBinaryData = encrypt(JSON.stringify(binData));
			}

			const cmData: InferInsertModel<typeof k8sConfigMaps> = {
				clusterId,
				name: cm.name,
				namespace: cm.namespace,
				data: encryptedData,
				binaryData: encryptedBinaryData,
				labels: JSON.stringify(cm.labels),
				k8sUid: cm.uid,
				updatedAt: new Date(),
				annotations: cm.annotations || {},
				resourceConfig: cm.resourceConfig || "",
			};

			if (existing.length > 0 && existing[0]) {
				await db
					.update(k8sConfigMaps)
					.set(cmData)
					.where(eq(k8sConfigMaps.id, existing[0].id));
			} else if (defaultOwner) {
				await db.insert(k8sConfigMaps).values({
					...cmData,
					ownerId: defaultOwner.id,
					autoCreated: true,
				});
			}
		}

		// Cleanup: remove auto-created configmaps no longer present
		const heartbeatUids = configMaps
			.map((cm) => cm.uid)
			.filter((uid): uid is string => !!uid);
		const deleteFilter = [
			eq(k8sConfigMaps.clusterId, clusterId),
			eq(k8sConfigMaps.autoCreated, true),
		];
		if (heartbeatUids.length > 0) {
			deleteFilter.push(notInArray(k8sConfigMaps.k8sUid, heartbeatUids));
		}
		logger.info("Deleting configmaps", { heartbeatUids });
		await db.delete(k8sConfigMaps).where(and(...deleteFilter));
	}

	private async syncSecrets(
		clusterId: number,
		secrets: Heartbeat["secrets"],
	): Promise<void> {
		const defaultOwner = await this.findDefaultOwner();

		for (const sec of secrets) {
			let existing = await db
				.select()
				.from(k8sSecrets)
				.where(
					and(
						eq(k8sSecrets.clusterId, clusterId),
						eq(k8sSecrets.k8sUid, sec.uid),
					),
				);

			if (existing.length === 0) {
				existing = await db
					.select()
					.from(k8sSecrets)
					.where(
						and(
							eq(k8sSecrets.clusterId, clusterId),
							eq(k8sSecrets.name, sec.name),
							eq(k8sSecrets.namespace, sec.namespace),
						),
					);
			}

			const binData: Record<string, string> = {};
			for (const [key, val] of Object.entries(sec.data)) {
				binData[key] = Buffer.from(val).toString("base64");
			}

			const secData: InferInsertModel<typeof k8sSecrets> = {
				clusterId,
				name: sec.name,
				namespace: sec.namespace,
				type: sec.type,
				data: encrypt(JSON.stringify(binData)),
				labels: JSON.stringify(sec.labels),
				k8sUid: sec.uid,
				updatedAt: new Date(),
				annotations: sec.annotations || {},
				resourceConfig: sec.resourceConfig || "",
			};

			if (existing.length > 0 && existing[0]) {
				await db
					.update(k8sSecrets)
					.set(secData)
					.where(eq(k8sSecrets.id, existing[0].id));
			} else if (defaultOwner) {
				await db.insert(k8sSecrets).values({
					...secData,
					ownerId: defaultOwner.id,
					autoCreated: true,
				});
			}
		}

		// Cleanup: remove auto-created secrets no longer present
		const heartbeatUids = secrets
			.map((s) => s.uid)
			.filter((uid): uid is string => !!uid);
		const deleteFilter = [
			eq(k8sSecrets.clusterId, clusterId),
			eq(k8sSecrets.autoCreated, true),
		];
		if (heartbeatUids.length > 0) {
			deleteFilter.push(notInArray(k8sSecrets.k8sUid, heartbeatUids));
		}
		logger.info("Deleting secrets", { heartbeatUids });
		await db.delete(k8sSecrets).where(and(...deleteFilter));
	}

	// ─── Phase 2: Validate DB state → cluster ─────────────────────────────────

	/** Returns true if a command was sent (caller should stop processing). */
	private async validateDeployments(
		agentId: number,
		clusterId: number,
		heartbeat: Heartbeat,
		agentManager: AgentManager,
	): Promise<boolean> {
		const configured = await db
			.select()
			.from(k8sDeployments)
			.where(
				and(
					eq(k8sDeployments.clusterId, clusterId),
					or(
						isNull(k8sDeployments.autoCreated),
						eq(k8sDeployments.autoCreated, false),
					),
				),
			);

		const active = heartbeat.deployments || [];

		for (const dbDep of configured) {
			const match = active.find(
				(d) => d.name === dbDep.name && d.namespace === dbDep.namespace,
			);

			if (!match) {
				logger.info(
					`Missing Deployment: ${dbDep.name} in ${dbDep.namespace}. Creating...`,
				);
				const envVars = decryptEnvVars(dbDep.envVariables, dbDep.name);
				await agentManager.sendCommand(agentId, clusterId, {
					id: "",
					type: Command_CommandType.CREATE_DEPLOYMENT,
					payload: this.buildDeploymentManifest(dbDep, envVars),
					targetNamespace: dbDep.namespace,
					targetName: dbDep.name,
				});
				return true;
			}

			const hasReplicaMismatch = match.replicas !== dbDep.replicas;
			const hasImageMismatch =
				dbDep.dockerImage && match.dockerImage !== dbDep.dockerImage;

			if (hasReplicaMismatch || hasImageMismatch) {
				logger.info(
					`Syncing Deployment ${dbDep.name}: Mismatch (Replicas: ${match.replicas} vs ${dbDep.replicas}, Image: ${match.dockerImage} vs ${dbDep.dockerImage})`,
				);
				const envVars = decryptEnvVars(dbDep.envVariables, dbDep.name);
				await agentManager.sendCommand(agentId, clusterId, {
					id: "",
					type: Command_CommandType.CREATE_DEPLOYMENT,
					payload: this.buildDeploymentManifest(dbDep, envVars),
					targetNamespace: dbDep.namespace,
					targetName: dbDep.name,
				});
				return true;
			}
		}

		return false;
	}

	/** Returns true if a command was sent. */
	private async validatePods(
		agentId: number,
		clusterId: number,
		heartbeat: Heartbeat,
		agentManager: AgentManager,
	): Promise<boolean> {
		const configured = await db
			.select()
			.from(k8sPods)
			.where(
				and(
					eq(k8sPods.clusterId, clusterId),
					isNull(k8sPods.deploymentId),
					or(isNull(k8sPods.autoCreated), eq(k8sPods.autoCreated, false)),
				),
			);

		const active = heartbeat.pods || [];

		for (const dbPod of configured) {
			const match = active.find(
				(p) => p.name === dbPod.name && p.namespace === dbPod.namespace,
			);

			if (!match) {
				if (dbPod.status === "Terminating") {
					logger.info(
						`Pod ${dbPod.name} is missing and was terminating. Cleaning up DB.`,
					);
					await db.delete(k8sPods).where(eq(k8sPods.id, dbPod.id));
					continue;
				}

				logger.info(
					`Missing Pod: ${dbPod.name} in ${dbPod.namespace}. Restoring...`,
				);
				const envVars = decryptEnvVars(dbPod.envVariables, dbPod.name);
				await agentManager.sendCommand(agentId, clusterId, {
					id: "",
					type: Command_CommandType.CREATE_POD,
					payload: this.buildPodManifest(dbPod, envVars),
					targetNamespace: dbPod.namespace,
					targetName: dbPod.name,
				});
				return true;
			}

			if (match.dockerImage !== dbPod.dockerImage) {
				logger.info(
					`Syncing Pod ${dbPod.name}: Image mismatch (${match.dockerImage} vs ${dbPod.dockerImage})`,
				);
				const envVars = decryptEnvVars(dbPod.envVariables, dbPod.name);
				await agentManager.sendCommand(agentId, clusterId, {
					id: "",
					type: Command_CommandType.CREATE_POD,
					payload: this.buildPodManifest(dbPod, envVars),
					targetNamespace: dbPod.namespace,
					targetName: dbPod.name,
				});
				return true;
			}

			// Re-send DELETE if pod persists but is marked Terminating in DB
			if (dbPod.status === "Terminating") {
				logger.info(
					`Pod ${dbPod.name} persists but is Terminating in DB. Re-sending delete.`,
				);
				await agentManager.sendCommand(agentId, clusterId, {
					id: "",
					type: 6, // DELETE_POD
					targetNamespace: dbPod.namespace,
					targetName: dbPod.name,
					payload: "",
				});
				return true;
			}
		}

		return false;
	}

	/** Returns true if a command was sent. */
	private async validateServices(
		agentId: number,
		clusterId: number,
		heartbeat: Heartbeat,
		agentManager: AgentManager,
	): Promise<boolean> {
		const configured = await db
			.select()
			.from(schema.k8sServices)
			.where(
				and(
					eq(schema.k8sServices.clusterId, clusterId),
					or(
						isNull(schema.k8sServices.autoCreated),
						eq(schema.k8sServices.autoCreated, false),
					),
				),
			);

		const active = heartbeat.services || [];

		for (const dbSvc of configured) {
			const match = active.find(
				(s) => s.name === dbSvc.name && s.namespace === dbSvc.namespace,
			);

			if (!match) {
				logger.info(
					`Missing Service: ${dbSvc.name} in ${dbSvc.namespace}. Restoring...`,
				);

				const manifest = {
					apiVersion: "v1",
					kind: "Service",
					metadata: {
						name: dbSvc.name,
						namespace: dbSvc.namespace,
						labels: dbSvc.labels ? JSON.parse(dbSvc.labels) : {},
						annotations: dbSvc.annotations || {},
						// OwnerReferences could be added here if we want to link it to a Deployment/Pod
					},
					spec: {
						type: dbSvc.type || "ClusterIP",
						selector: dbSvc.selector ? JSON.parse(dbSvc.selector) : {},
						ports: dbSvc.ports?.data,
					},
				};

				await agentManager.sendCommand(agentId, clusterId, {
					id: "",
					type: Command_CommandType.CREATE_DEPLOYMENT, // Maps to ApplyManifest in Agent
					payload: YAML.stringify(manifest),
					targetNamespace: dbSvc.namespace,
					targetName: dbSvc.name,
				});
				return true;
			}
		}

		return false;
	}

	/** Returns true if a command was sent. */
	private async validateConfigMaps(
		agentId: number,
		clusterId: number,
		heartbeat: Heartbeat,
		agentManager: AgentManager,
	): Promise<boolean> {
		const configured = await db
			.select()
			.from(k8sConfigMaps)
			.where(
				and(
					eq(k8sConfigMaps.clusterId, clusterId),
					or(
						isNull(k8sConfigMaps.autoCreated),
						eq(k8sConfigMaps.autoCreated, false),
					),
				),
			);

		const active = heartbeat.configMaps || [];

		for (const dbCm of configured) {
			const match = active.find(
				(cm) => cm.name === dbCm.name && cm.namespace === dbCm.namespace,
			);

			if (!match) {
				logger.info(
					`Missing ConfigMap: ${dbCm.name} in ${dbCm.namespace}. Restoring...`,
				);

				let data: Record<string, string> | undefined;
				if (dbCm.data) {
					try {
						data = JSON.parse(decrypt(dbCm.data));
					} catch (e) {
						logger.error("Failed to decrypt configmap data", dbCm.name, e);
					}
				}

				let binaryData: Record<string, string> | undefined;
				if (dbCm.binaryData) {
					try {
						binaryData = JSON.parse(decrypt(dbCm.binaryData));
					} catch (e) {
						logger.error(
							"Failed to decrypt configmap binaryData",
							dbCm.name,
							e,
						);
					}
				}

				await agentManager.sendCommand(agentId, clusterId, {
					id: "",
					type: Command_CommandType.CREATE_CONFIGMAP,
					payload: YAML.stringify({
						apiVersion: "v1",
						kind: "ConfigMap",
						metadata: {
							name: dbCm.name,
							namespace: dbCm.namespace,
							labels: dbCm.labels ? JSON.parse(dbCm.labels) : {},
							annotations: dbCm.annotations || {},
							// OwnerReferences could be added here if we want to link it to a Deployment/Pod
						},
						data,
						binaryData,
					}),
					targetNamespace: dbCm.namespace,
					targetName: dbCm.name,
				});
				return true;
			}
		}

		return false;
	}

	/** Returns true if a command was sent. */
	private async validateSecrets(
		agentId: number,
		clusterId: number,
		heartbeat: Heartbeat,
		agentManager: AgentManager,
	): Promise<boolean> {
		const configured = await db
			.select()
			.from(k8sSecrets)
			.where(
				and(
					eq(k8sSecrets.clusterId, clusterId),
					or(isNull(k8sSecrets.autoCreated), eq(k8sSecrets.autoCreated, false)),
				),
			);

		const active = heartbeat.secrets || [];

		for (const dbSecret of configured) {
			const match = active.find(
				(s) => s.name === dbSecret.name && s.namespace === dbSecret.namespace,
			);

			if (!match) {
				logger.info(
					`Missing Secret: ${dbSecret.name} in ${dbSecret.namespace}. Restoring...`,
				);

				let data: Record<string, string> | undefined;
				if (dbSecret.data) {
					try {
						data = JSON.parse(decrypt(dbSecret.data));
					} catch (e) {
						logger.error("Failed to decrypt secret data", dbSecret.name, e);
					}
				}

				await agentManager.sendCommand(agentId, clusterId, {
					id: "",
					type: Command_CommandType.CREATE_SECRET,
					payload: YAML.stringify({
						apiVersion: "v1",
						kind: "Secret",
						type: dbSecret.type || "Opaque",
						metadata: {
							name: dbSecret.name,
							namespace: dbSecret.namespace,
							labels: dbSecret.labels ? JSON.parse(dbSecret.labels) : {},
							annotations: dbSecret.annotations || {},
						},
						data,
					}),
					targetNamespace: dbSecret.namespace,
					targetName: dbSecret.name,
				});

				// Add audit log for secret restoration
				logger.info(
					`Restoring Secret: ${dbSecret.name} in ${dbSecret.namespace}`,
					{ secretType: dbSecret.type, clusterId, agentId },
				);
				return true;
			}
		}

		return false;
	}

	private async syncIngresses(
		clusterId: number,
		ingresses: Heartbeat["ingresses"],
	): Promise<void> {
		for (const ing of ingresses) {
			// Find the linked service by name/namespace to get its DB id
			const service = await db.query.k8sServices.findFirst({
				where: {
					clusterId,
					name: ing.serviceName,
					namespace: ing.namespace,
				},
			});

			let existing = await db
				.select()
				.from(k8sIngresses)
				.where(
					and(
						eq(k8sIngresses.clusterId, clusterId),
						eq(k8sIngresses.k8sUid, ing.uid),
					),
				);

			if (existing.length === 0) {
				existing = await db
					.select()
					.from(k8sIngresses)
					.where(
						and(
							eq(k8sIngresses.clusterId, clusterId),
							eq(k8sIngresses.name, ing.name),
							eq(k8sIngresses.namespace, ing.namespace),
						),
					);
			}

			const ingData: Partial<InferInsertModel<typeof k8sIngresses>> = {
				clusterId,
				name: ing.name,
				namespace: ing.namespace,
				protocol: ing.protocol,
				port: ing.port || null,
				serviceName: ing.serviceName,
				domain: ing.domain || null,
				path: ing.path || null,
				k8sUid: ing.uid,
				updatedAt: new Date(),
				...(service ? { serviceId: service.id } : {}),
				annotations: ing.annotations || {},
				labels: ing.labels || {},
				ownerId: null, // No owner for ingresses since they don't have a controller we can link to
				resourceConfig: ing.resourceConfig || "",
				// We can consider linking to the service's ownerId in the future if needed
			};

			const existingRecord = existing[0];
			if (existingRecord) {
				await db
					.update(k8sIngresses)
					.set({
						k8sUid: ing.uid,
						updatedAt: new Date(),
						...(service ? { serviceId: service.id } : {}),
						// Also sync snapshot fields from heartbeat
						protocol: ing.protocol,
						port: ing.port || null,
						serviceName: ing.serviceName,
						domain: ing.domain || null,
						path: ing.path || null,
					})
					.where(eq(k8sIngresses.id, existingRecord.id));
			} else if (service) {
				// Only auto-create if we can resolve the serviceId (required FK)
				await db.insert(k8sIngresses).values({
					...(ingData as InferInsertModel<typeof k8sIngresses>),
					serviceId: service.id,
					autoCreated: true,
				});
			}
		}

		// Cleanup: remove auto-created ingresses no longer present
		const heartbeatUids = ingresses
			.map((i) => i.uid)
			.filter((uid): uid is string => !!uid);
		const deleteFilter = [
			eq(k8sIngresses.clusterId, clusterId),
			eq(k8sIngresses.autoCreated, true),
		];
		if (heartbeatUids.length > 0) {
			deleteFilter.push(notInArray(k8sIngresses.k8sUid, heartbeatUids));
		}
		logger.info("Deleting ingresses", { heartbeatUids });
		await db.delete(k8sIngresses).where(and(...deleteFilter));
	}

	private async syncPVCs(
		clusterId: number,
		pvcs: Heartbeat["pvcs"],
	): Promise<void> {
		try {
			for (const pvc of pvcs) {
				let existing = await db
					.select()
					.from(k8sPersistentVolumeClaims)
					.where(
						and(
							eq(k8sPersistentVolumeClaims.clusterId, clusterId),
							eq(k8sPersistentVolumeClaims.k8sUid, pvc.uid),
						),
					);

				if (existing.length === 0) {
					existing = await db
						.select()
						.from(k8sPersistentVolumeClaims)
						.where(
							and(
								eq(k8sPersistentVolumeClaims.clusterId, clusterId),
								eq(k8sPersistentVolumeClaims.name, pvc.name),
								eq(k8sPersistentVolumeClaims.namespace, pvc.namespace),
							),
						);
				}

				const pvcData: InferInsertModel<typeof k8sPersistentVolumeClaims> = {
					clusterId,
					name: pvc.name,
					namespace: pvc.namespace,
					capacity: Number(pvc.capacity),
					phase: pvc.phase,
					storageClass: pvc.storageClass,
					volumeName: pvc.volumeName,
					k8sUid: pvc.uid,
					labels: pvc.labels || {},
					annotations: pvc.annotations || {},
					updatedAt: new Date(),
					resourceConfig: pvc.resourceConfig || "",
				};

				const existingRecord = existing[0];
				if (existingRecord) {
					await db
						.update(k8sPersistentVolumeClaims)
						.set(pvcData)
						.where(eq(k8sPersistentVolumeClaims.id, existingRecord.id));
				} else {
					const defaultOwner = await this.findDefaultOwner();
					if (!defaultOwner) throw new Error("Default account not found");

					await db.insert(k8sPersistentVolumeClaims).values({
						...pvcData,
						ownerId: defaultOwner.id,
						autoCreated: true,
					});
				}
			}

			// Cleanup: remove auto-created PVCs no longer present
			const heartbeatUids = pvcs
				.map((p) => p.uid)
				.filter((uid): uid is string => !!uid);
			const deleteFilter = [
				eq(k8sPersistentVolumeClaims.clusterId, clusterId),
				eq(k8sPersistentVolumeClaims.autoCreated, true),
			];
			if (heartbeatUids.length > 0) {
				deleteFilter.push(
					notInArray(k8sPersistentVolumeClaims.k8sUid, heartbeatUids),
				);
			}
			await db.delete(k8sPersistentVolumeClaims).where(and(...deleteFilter));
		} catch (error) {
			logger.error("Failed to sync PVCs", { clusterId, error });
			throw error;
		}
	}

	private async syncStorageClasses(
		clusterId: number,
		storageClasses: Heartbeat["storageClasses"],
	): Promise<void> {
		try {
			for (const sc of storageClasses) {
				const existing = await db
					.select()
					.from(k8sStorageClasses)
					.where(
						and(
							eq(k8sStorageClasses.clusterId, clusterId),
							eq(k8sStorageClasses.name, sc.name),
						),
					);

				const isDefault =
					sc.annotations?.["storageclass.kubernetes.io/is-default-class"] ===
					"true";

				const scData: InferInsertModel<typeof k8sStorageClasses> = {
					clusterId,
					name: sc.name,
					provisioner: sc.provisioner,
					reclaimPolicy: sc.reclaimPolicy || "Delete",
					volumeBindingMode: sc.volumeBindingMode || "Immediate",
					allowVolumeExpansion: sc.allowVolumeExpansion || false,
					annotations: sc.annotations || {},
					labels: sc.labels || {},
					isDefault,
					updatedAt: new Date(),
					resourceConfig: sc.resourceConfig || "",
				};

				if (existing.length > 0 && existing[0]) {
					await db
						.update(k8sStorageClasses)
						.set(scData)
						.where(eq(k8sStorageClasses.id, existing[0].id));
				} else {
					await db.insert(k8sStorageClasses).values(scData);
				}
			}

			// Cleanup: remove storage classes no longer present
			const heartbeatNames = storageClasses
				.map((sc) => sc.name)
				.filter((name): name is string => !!name);
			const deleteFilter = [eq(k8sStorageClasses.clusterId, clusterId)];
			if (heartbeatNames.length > 0) {
				deleteFilter.push(notInArray(k8sStorageClasses.name, heartbeatNames));
			}
			await db.delete(k8sStorageClasses).where(and(...deleteFilter));
		} catch (error) {
			logger.error("Failed to sync StorageClasses", { clusterId, error });
			throw error;
		}
	}

	private async syncPVs(
		clusterId: number,
		pvs: Heartbeat["pvs"],
	): Promise<void> {
		try {
			for (const pv of pvs) {
				const existing = await db
					.select()
					.from(k8sPersistentVolumes)
					.where(
						and(
							eq(k8sPersistentVolumes.clusterId, clusterId),
							eq(k8sPersistentVolumes.name, pv.name),
						),
					);

				const pvData: InferInsertModel<typeof k8sPersistentVolumes> = {
					clusterId,
					name: pv.name,
					capacity: Number(pv.capacity),
					phase: pv.phase,
					reclaimPolicy: pv.reclaimPolicy || "Retain",
					storageClass: pv.storageClass || null,
					boundPvc: pv.boundPvc || null,
					accessModes: { data: pv.accessModes || [] },
					annotations: pv.annotations || {},
					labels: pv.labels || {},
					updatedAt: new Date(),
					resourceConfig: pv.resourceConfig || "",
				};

				if (existing.length > 0 && existing[0]) {
					await db
						.update(k8sPersistentVolumes)
						.set(pvData)
						.where(eq(k8sPersistentVolumes.id, existing[0].id));
				} else {
					await db.insert(k8sPersistentVolumes).values(pvData);
				}
			}

			// Cleanup: remove PVs no longer present
			const heartbeatNames = pvs
				.map((pv) => pv.name)
				.filter((name): name is string => !!name);
			const deleteFilter = [eq(k8sPersistentVolumes.clusterId, clusterId)];
			if (heartbeatNames.length > 0) {
				deleteFilter.push(
					notInArray(k8sPersistentVolumes.name, heartbeatNames),
				);
			}
			await db.delete(k8sPersistentVolumes).where(and(...deleteFilter));
		} catch (error) {
			logger.error("Failed to sync PVs", { clusterId, error });
			throw error;
		}
	}

	/** Returns true if a command was sent. */
	private async validateIngresses(
		agentId: number,
		clusterId: number,
		heartbeat: Heartbeat,
		agentManager: AgentManager,
	): Promise<boolean> {
		const configured = await db
			.select()
			.from(k8sIngresses)
			.where(
				and(
					eq(k8sIngresses.clusterId, clusterId),
					or(
						isNull(k8sIngresses.autoCreated),
						eq(k8sIngresses.autoCreated, false),
					),
				),
			);

		const active = heartbeat.ingresses || [];

		for (const ingress of configured) {
			const match = active.find(
				(i) => i.name === ingress.name && i.namespace === ingress.namespace,
			);

			if (match) continue;

			if (ingress.serviceId === null) {
				logger.warn(
					`Skipping restore of ingress ${ingress.name}: serviceId is null (linked service was deleted)`,
				);
				continue;
			}

			// Look up the linked service to get internalPort
			const service = await db.query.k8sServices.findFirst({
				where: { id: ingress.serviceId },
			});

			if (
				!service ||
				!service.ports ||
				!service.ports.data ||
				service.ports.data.length === 0
			) {
				logger.error(
					`Cannot restore ingress ${ingress.name}: linked service not found or has no ports`,
				);
				continue;
			}

			const internalPort = service.ports.data[0].port;
			const protocol = (ingress.protocol || "http") as "http" | "tcp" | "udp";

			logger.info(
				`Missing Ingress: ${ingress.name} in ${ingress.namespace}. Restoring...`,
			);

			const manifest = generateIngressRouteManifest({
				name: ingress.name,
				namespace: ingress.namespace,
				protocol,
				port: ingress.port || 0,
				internalPort,
				serviceName: ingress.serviceName || service.name,
				annotations: ingress.annotations || {},
				labels: ingress.labels || {},
				domain: ingress.domain || undefined,
			});

			await agentManager.sendCommand(agentId, clusterId, {
				id: "",
				type: Command_CommandType.CREATE_INGRESS,
				payload: manifest,
				targetNamespace: ingress.namespace,
				targetName: ingress.name,
			});
			return true;
		}

		return false;
	}

	// ─── Main handler ──────────────────────────────────────────────────────────

	async handleHeartbeat(
		agentId: number,
		heartbeat: Heartbeat,
		agentManager: AgentManager,
	): Promise<void> {
		logger.info(`Processing heartbeat for agent ${agentId}`);
		// logger.info(`Heartbeat: ${JSON.stringify(heartbeat.services)}`);

		const cluster = await db.query.k8sCluster.findFirst({
			where: { agentId },
		});

		if (!cluster) {
			logger.error(`No cluster found for agent ${agentId}`);
			return;
		}

		// 1. Update cluster stats and sync resources in a transaction
		await db.transaction(async () => {
			// Update cluster stats
			if (heartbeat.clusterResource) {
				await db
					.update(k8sCluster)
					.set({
						cpuUsage: Number(heartbeat.clusterResource.cpuUsage),
						ramUsage: Number(heartbeat.clusterResource.ramUsage),
						cpuCapacity: Number(heartbeat.clusterResource.cpuCapacity),
						ramCapacity: Number(heartbeat.clusterResource.ramCapacity),
						internalClusterDomain: heartbeat.clusterResource.clusterDomain,
						updatedAt: new Date(),
						status: "active",
					})
					.where(eq(k8sCluster.id, cluster.id));
			}

			// 2. Sync resources from heartbeat → DB
			await this.syncNodes(cluster.id, heartbeat.nodes || []);
			await this.syncDeployments(cluster.id, heartbeat.deployments || []);
			await this.syncPods(cluster.id, heartbeat.pods || []);
			await this.syncServices(cluster.id, heartbeat.services || []);
			await this.syncConfigMaps(cluster.id, heartbeat.configMaps || []);
			await this.syncSecrets(cluster.id, heartbeat.secrets || []);
			await this.syncIngresses(cluster.id, heartbeat.ingresses || []);
			await this.syncPVCs(cluster.id, heartbeat.pvcs || []);
			await this.syncStorageClasses(cluster.id, heartbeat.storageClasses || []);
			await this.syncPVs(cluster.id, heartbeat.pvs || []);
		});

		// 3. Validate DB state → cluster (one command per heartbeat cycle)
		if (
			await this.validateDeployments(
				agentId,
				cluster.id,
				heartbeat,
				agentManager,
			)
		)
			return;
		if (await this.validatePods(agentId, cluster.id, heartbeat, agentManager))
			return;
		if (
			await this.validateServices(agentId, cluster.id, heartbeat, agentManager)
		)
			return;
		if (
			await this.validateConfigMaps(
				agentId,
				cluster.id,
				heartbeat,
				agentManager,
			)
		)
			return;
		if (
			await this.validateSecrets(agentId, cluster.id, heartbeat, agentManager)
		)
			return;
		if (
			await this.validateIngresses(agentId, cluster.id, heartbeat, agentManager)
		)
			return;
	}

	// ─── Other methods ─────────────────────────────────────────────────────────

	async getAgentByToken(token: string) {
		return await db.query.clusterAgent.findFirst({
			where: { token },
		});
	}

	async agentDisconnect(agentId: number) {
		const agent = await db
			.update(clusterAgent)
			.set({ lastSeenAt: new Date() })
			.where(eq(clusterAgent.id, agentId))
			.returning();

		if (!agent || !agent[0]) {
			logger.error(`No agent found for id ${agentId}`);
			return null;
		}

		const cluster = await db.query.k8sCluster.findFirst({
			where: { agentId: agent[0].id },
		});

		if (!cluster) {
			logger.error(`No cluster found for id ${agent[0].id}`);
			return null;
		}

		await db
			.update(k8sCluster)
			.set({ status: "inactive" })
			.where(eq(k8sCluster.id, cluster.id));

		return agent[0];
	}

	async allocateGatewayPort(
		clusterId: number,
		protocol: "http" | "tcp" | "udp",
	) {
		const result = await db
			.select({ port: gatewayPorts.port })
			.from(gatewayPorts)
			.where(eq(gatewayPorts.clusterId, clusterId));

		const usedPortSet = new Set(result.map((p) => p.port));

		let portToUse = -1;
		for (let port = 30000; port <= 31000; port++) {
			if (!usedPortSet.has(port)) {
				portToUse = port;
				break;
			}
		}

		if (portToUse === -1) throw new Error("No available ports");

		const [entry] = await db
			.insert(gatewayPorts)
			.values({ clusterId, protocol, port: portToUse, allocated: true })
			.returning();

		return entry;
	}

	async releaseGatewayPort(clusterId: number, port: number) {
		await db
			.delete(gatewayPorts)
			.where(
				and(eq(gatewayPorts.clusterId, clusterId), eq(gatewayPorts.port, port)),
			);
	}
}

export const agentService = new AgentService();
