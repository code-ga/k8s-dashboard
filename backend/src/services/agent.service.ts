import { and, eq, type InferInsertModel, isNull, or } from "drizzle-orm";
import YAML from "yaml";
import type {
	Heartbeat,
	// Command,
} from "../../pb-generated/agent-backend/websocket"; // Check imports carefully
import { Command_CommandType } from "../../pb-generated/agent-backend/websocket";
import { db } from "../database";
import {
	clusterAgent,
	gatewayPorts,
	k8sCluster,
	k8sClusterNode,
	k8sConfigMaps,
	k8sDeployments,
	k8sPods,
	k8sSecrets,
	schema,
} from "../database/schema";
import { decrypt, encrypt } from "../utils/crypto";
import {
	generateDeploymentManifest,
	generatePodManifest,
} from "../utils/k8s-manifest";
import {
	deleteDeploymentPorts,
	deletePodPorts,
	insertDeploymentPorts,
	insertPodPorts,
	type PortRef,
} from "../utils/resource-refs";
import type { AgentManager } from "./agentManager";
export class AgentService {
	// Process incoming heartbeat
	async handleHeartbeat(
		agentId: number,
		heartbeat: Heartbeat,
		agentManager: AgentManager,
	): Promise<void> {
		console.log(`Processing heartbeat for agent ${agentId}`);

		// 1. Update Cluster Stats (CPU/RAM Usage)
		// We need to find the cluster associated with this agent
		const cluster = await db.query.k8sCluster.findFirst({
			where: {
				agentId: agentId,
			},
		});

		if (!cluster) {
			console.error(`No cluster found for agent ${agentId}`);
			return;
		}

		// Update real-time stats
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

		// Update Nodes
		if (heartbeat.nodes) {
			for (const node of heartbeat.nodes) {
				// 1. Try Find by UID
				let existingNode = await db
					.select()
					.from(k8sClusterNode)
					.where(
						and(
							eq(k8sClusterNode.clusterId, cluster.id),
							eq(k8sClusterNode.k8sUid, node.uid),
						),
					);

				// 2. Fallback to Name (to link new UID to existing record)
				if (existingNode.length === 0) {
					existingNode = await db
						.select()
						.from(k8sClusterNode)
						.where(
							and(
								eq(k8sClusterNode.clusterId, cluster.id),
								eq(k8sClusterNode.name, node.name),
							),
						);
				}

				const nodeData: InferInsertModel<typeof k8sClusterNode> = {
					clusterId: cluster.id,
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
				};

				if (existingNode.length > 0 && existingNode[0]?.k8sUid) {
					await db
						.update(k8sClusterNode)
						.set(nodeData)
						.where(eq(k8sClusterNode.id, existingNode[0].id));
				} else {
					await db.insert(k8sClusterNode).values({
						...nodeData,
						autoCreated: true,
					});
				}
			}
		}

		// Sync Deployments
		if (heartbeat.deployments) {
			for (const dep of heartbeat.deployments) {
				// 1. Try Find by UID
				let existing = await db
					.select()
					.from(k8sDeployments)
					.where(
						and(
							eq(k8sDeployments.clusterId, cluster.id),
							eq(k8sDeployments.k8sUid, dep.uid),
						),
					);

				// 2. Fallback to Name/Namespace
				if (existing.length === 0) {
					existing = await db
						.select()
						.from(k8sDeployments)
						.where(
							and(
								eq(k8sDeployments.clusterId, cluster.id),
								eq(k8sDeployments.name, dep.name),
								eq(k8sDeployments.namespace, dep.namespace),
							),
						);
				}

				const depData: Omit<
					InferInsertModel<typeof k8sDeployments>,
					"ownerId"
				> = {
					clusterId: cluster.id,
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
					// ports: dep.ports, // Removed in favor of normalized tables
					updatedAt: new Date(),
				};

				if (existing.length > 0 && existing[0]?.k8sUid) {
					await db
						.update(k8sDeployments)
						.set({
							availableReplicas: dep.availableReplicas,
							unavailableReplicas: dep.unavailableReplicas,
							k8sUid: dep.uid,
							updatedAt: new Date(),
						})
						.where(eq(k8sDeployments.id, existing[0].id));

					// Sync Ports
					const deploymentId = existing[0].id;
					await deleteDeploymentPorts(deploymentId);
					if (dep.ports && dep.ports.length > 0) {
						const ports: PortRef[] = dep.ports.map((p) => ({
							containerPort: p.containerPort,
							name: p.name,
						}));
						await insertDeploymentPorts(ports, deploymentId);
					}
				} else {
					const defaultOwner = await db.query.profile.findFirst({
						where: {
							permission: {
								arrayContains: ["default-account"],
							},
						},
					});
					if (!defaultOwner) {
						throw new Error("Default account not found");
					}
					const [newDep] = await db
						.insert(k8sDeployments)
						.values({
							...depData,
							ownerId: defaultOwner.id,
							autoCreated: true, // created by agent when it detects a deployment not in DB
						})
						.returning();

					// Sync Ports for new deployment
					if (newDep && dep.ports && dep.ports.length > 0) {
						const ports: PortRef[] = dep.ports.map((p) => ({
							containerPort: p.containerPort,
							name: p.name,
						}));
						await insertDeploymentPorts(ports, newDep.id);
					}
				}
			}

			// Cleanup: remove auto-created deployments no longer present in the cluster
			const heartbeatDepUids = new Set(
				heartbeat.deployments.map((d) => d.uid).filter(Boolean),
			);
			const autoCreatedDeps = await db
				.select()
				.from(k8sDeployments)
				.where(
					and(
						eq(k8sDeployments.clusterId, cluster.id),
						eq(k8sDeployments.autoCreated, true),
					),
				);
			for (const dep of autoCreatedDeps) {
				if (dep.k8sUid && !heartbeatDepUids.has(dep.k8sUid)) {
					await db.delete(k8sDeployments).where(eq(k8sDeployments.id, dep.id));
				}
			}
		}

		// Sync Pods
		if (heartbeat.pods) {
			const defaultOwner = await db.query.profile.findFirst({
				// where: (fields, { arrayContains }) =>
				// 	arrayContains(fields.permission, ["default-account"]),
				where: {
					permission: {
						arrayContains: ["default-account"],
					},
				},
			});

			if (!defaultOwner) {
				console.error("Default owner not found for pod syncing");
			} else {
				for (const pod of heartbeat.pods) {
					// Find the node this pod is running on
					const nodeResult = await db
						.select()
						.from(k8sClusterNode)
						.where(
							and(
								eq(k8sClusterNode.clusterId, cluster.id),
								eq(k8sClusterNode.name, pod.nodeName),
							),
						);

					if (nodeResult.length === 0 || !nodeResult[0]) {
						console.error(`Node ${pod.nodeName} not found for pod ${pod.name}`);
						continue;
					}
					const node = nodeResult[0];

					// 1. Try Find by UID
					let existingPodResult = await db
						.select()
						.from(k8sPods)
						.where(
							and(
								eq(k8sPods.clusterId, cluster.id),
								eq(k8sPods.k8sUid, pod.uid),
							),
						);

					// 2. Fallback to Name/Namespace
					if (existingPodResult.length === 0) {
						existingPodResult = await db
							.select()
							.from(k8sPods)
							.where(
								and(
									eq(k8sPods.clusterId, cluster.id),
									eq(k8sPods.name, pod.name),
									eq(k8sPods.namespace, pod.namespace),
								),
							);
					}

					const podData: InferInsertModel<typeof k8sPods> = {
						clusterId: cluster.id,
						deploymentId: null,
						nodeId: node.id,
						ownerId: defaultOwner.id,
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
						// ports: pod.ports, // Removed in favor of normalized tables
						k8sUid: pod.uid,

						status: pod.status || "Unknown",
						cpuUsage: Number(pod.cpuUsage),
						memoryUsage: Number(pod.ramUsage),
						updatedAt: new Date(),
					};

					if (existingPodResult.length > 0 && existingPodResult[0]?.k8sUid) {
						const existingPod = existingPodResult[0];
						// Preserve "Terminating" status if set in DB
						const newStatus =
							existingPod.status === "Terminating"
								? "Terminating"
								: pod.status || "Unknown";

						// Only update status/usage/tracking fields to avoid overwriting desired spec in DB
						await db
							.update(k8sPods)
							.set({
								nodeId: node.id,
								status: newStatus,
								cpuUsage: Number(pod.cpuUsage),
								memoryUsage: Number(pod.ramUsage),
								k8sUid: pod.uid,
								updatedAt: new Date(),
							})
							.where(eq(k8sPods.id, existingPod.id));

						// Sync Ports
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
							.values({
								...podData,
								autoCreated: true,
							})
							.returning(); // Fix lint: removed createdAt

						// Sync Ports for new pod
						if (newPod && pod.ports && pod.ports.length > 0) {
							const ports: PortRef[] = pod.ports.map((p) => ({
								containerPort: p.containerPort,
								name: p.name,
							}));
							await insertPodPorts(ports, newPod.id);
						}
					}
				}
			}

			// Cleanup: remove auto-created bare pods no longer present in the cluster
			const heartbeatPodUids = new Set(
				heartbeat.pods.map((p) => p.uid).filter(Boolean),
			);
			const autoCreatedPods = await db
				.select()
				.from(k8sPods)
				.where(
					and(
						eq(k8sPods.clusterId, cluster.id),
						eq(k8sPods.autoCreated, true),
						isNull(k8sPods.deploymentId),
					),
				);
			for (const pod of autoCreatedPods) {
				if (pod.k8sUid && !heartbeatPodUids.has(pod.k8sUid)) {
					await db.delete(k8sPods).where(eq(k8sPods.id, pod.id));
				}
			}
		}

		// Sync Services
		if (heartbeat.services) {
			for (const svc of heartbeat.services) {
				// 1. Try Find by UID
				let existingSvc = await db
					.select()
					.from(schema.k8sServices)
					.where(
						and(
							eq(schema.k8sServices.clusterId, cluster.id),
							eq(schema.k8sServices.k8sUid, svc.uid),
						),
					);

				// 2. Fallback to Name/Namespace
				if (existingSvc.length === 0) {
					existingSvc = await db
						.select()
						.from(schema.k8sServices)
						.where(
							and(
								eq(schema.k8sServices.clusterId, cluster.id),
								eq(schema.k8sServices.name, svc.name),
								eq(schema.k8sServices.namespace, svc.namespace),
							),
						);
				}

				const svcData: InferInsertModel<typeof schema.k8sServices> = {
					clusterId: cluster.id,
					name: svc.name,
					namespace: svc.namespace,
					type: svc.type,
					clusterIp: svc.clusterIp,
					selector: JSON.stringify(svc.selector),
					k8sUid: svc.uid,
					labels: JSON.stringify(svc.labels),
					ports: svc.ports,
					updatedAt: new Date(),
				};

				if (existingSvc.length > 0 && existingSvc[0]?.k8sUid) {
					await db
						.update(schema.k8sServices)
						.set(svcData)
						.where(eq(schema.k8sServices.id, existingSvc[0].id));
				} else {
					const defaultOwner = await db.query.profile.findFirst({
						where: {
							permission: {
								arrayContains: ["default-account"],
							},
						},
					});
					if (!defaultOwner) {
						console.error("Default owner not found for pod syncing");
					} else {
						svcData.ownerId = defaultOwner.id;
					}
					await db.insert(schema.k8sServices).values({
						...svcData,
						autoCreated: true, // created by agent when it detects a service not in DB
					});
				}
			}

			// Cleanup: remove auto-created services no longer present in the cluster
			const heartbeatSvcUids = new Set(
				heartbeat.services.map((s) => s.uid).filter(Boolean),
			);
			const autoCreatedSvcs = await db
				.select()
				.from(schema.k8sServices)
				.where(
					and(
						eq(schema.k8sServices.clusterId, cluster.id),
						eq(schema.k8sServices.autoCreated, true),
					),
				);
			for (const svc of autoCreatedSvcs) {
				if (svc.k8sUid && !heartbeatSvcUids.has(svc.k8sUid)) {
					await db
						.delete(schema.k8sServices)
						.where(eq(schema.k8sServices.id, svc.id));
				}
			}
		}

		// 2. Validate Deployments (Source of Truth: k8sDeployments in DB)
		// Only sync deployments created by our app (not auto-discovered ones)
		const configuredDeployments = await db
			.select()
			.from(k8sDeployments)
			.where(
				and(
					eq(k8sDeployments.clusterId, cluster.id),
					or(isNull(k8sDeployments.autoCreated), eq(k8sDeployments.autoCreated, false)),
				),
			);

		const activeDeployments = heartbeat.deployments || [];

		for (const dbDep of configuredDeployments) {
			// Find corresponding deployment
			const matchingDeployment = activeDeployments.find(
				(d) => d.name === dbDep.name && d.namespace === dbDep.namespace,
			);

			if (!matchingDeployment) {
				console.log(
					`Missing Deployment: ${dbDep.name} in ${dbDep.namespace}. Creating...`,
				);

				let envVars: Record<string, string> | undefined;
				if (dbDep.envVariables) {
					try {
						envVars = JSON.parse(decrypt(dbDep.envVariables));
					} catch (e) {
						console.error(
							"Failed to decrypt env vars for deployment",
							dbDep.name,
							e,
						);
					}
				}

				const manifest = generateDeploymentManifest({
					name: dbDep.name,
					namespace: dbDep.namespace,
					image: dbDep.dockerImage || "",
					replicas: dbDep.replicas,
					labels: dbDep.labels ? JSON.parse(dbDep.labels) : undefined,
					selector: dbDep.selector ? JSON.parse(dbDep.selector) : undefined,
					ports: dbDep.ports,
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

				// Send CREATE (ApplyManifest) Command
				await agentManager.sendCommand(agentId, cluster.id, {
					id: "", // Will be set by agentManager
					type: Command_CommandType.CREATE_DEPLOYMENT, // Maps to ApplyManifest in Agent
					payload: manifest,
					targetNamespace: dbDep.namespace,
					targetName: dbDep.name,
				});
				return;
			}

			// Check for Drifts (Source of Truth is DB)
			const hasReplicaMismatch = matchingDeployment.replicas !== dbDep.replicas;
			const hasImageMismatch =
				dbDep.dockerImage &&
				matchingDeployment.dockerImage !== dbDep.dockerImage;

			if (hasReplicaMismatch || hasImageMismatch) {
				console.log(
					`Syncing Deployment ${dbDep.name}: Mismatch detected (Replicas: ${matchingDeployment.replicas} vs ${dbDep.replicas}, Image: ${matchingDeployment.dockerImage} vs ${dbDep.dockerImage})`,
				);

				let envVars: Record<string, string> | undefined;
				if (dbDep.envVariables) {
					try {
						envVars = JSON.parse(decrypt(dbDep.envVariables));
					} catch (e) {
						console.error("Failed to decrypt env vars", dbDep.name, e);
					}
				}

				const manifest = generateDeploymentManifest({
					name: dbDep.name,
					namespace: dbDep.namespace,
					image: dbDep.dockerImage || "",
					replicas: dbDep.replicas,
					labels: dbDep.labels ? JSON.parse(dbDep.labels) : undefined,
					selector: dbDep.selector ? JSON.parse(dbDep.selector) : undefined,
					ports: dbDep.ports,
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

				await agentManager.sendCommand(agentId, cluster.id, {
					id: "",
					type: Command_CommandType.CREATE_DEPLOYMENT, // Apply
					payload: manifest,
					targetNamespace: dbDep.namespace,
					targetName: dbDep.name,
				});
				return;
			}
		}

		// 3. Validate Pods (Bare Pods)
		// Only sync bare pods created by our app (not auto-discovered ones)
		const configuredPods = await db
			.select()
			.from(k8sPods)
			.where(
				and(
					eq(k8sPods.clusterId, cluster.id),
					isNull(k8sPods.deploymentId),
					or(isNull(k8sPods.autoCreated), eq(k8sPods.autoCreated, false)),
				),
			);

		const activePods = heartbeat.pods || [];

		for (const dbPod of configuredPods) {
			const matchingPod = activePods.find(
				(p) => p.name === dbPod.name && p.namespace === dbPod.namespace,
			);

			if (!matchingPod) {
				// Avoid restoring pods that are marked for deletion
				if (dbPod.status === "Terminating") {
					console.log(
						`Pod ${dbPod.name} is missing and was terminating. Cleaning up DB.`,
					);
					await db.delete(k8sPods).where(eq(k8sPods.id, dbPod.id));
					continue;
				}

				console.log(
					`Missing Pod: ${dbPod.name} in ${dbPod.namespace}. Restoring...`,
				);

				let envVars: Record<string, string> | undefined;
				if (dbPod.envVariables) {
					try {
						envVars = JSON.parse(decrypt(dbPod.envVariables));
					} catch (e) {
						console.error("Failed to decrypt env vars for pod", dbPod.name, e);
					}
				}

				const manifest = generatePodManifest({
					name: dbPod.name,
					namespace: dbPod.namespace,
					image: dbPod.dockerImage,
					command: dbPod.command ? dbPod.command.split(" ") : undefined,
					args: dbPod.args ? dbPod.args.split(" ") : undefined,
					labels:
						dbPod.labels && dbPod.labels !== ""
							? JSON.parse(dbPod.labels)
							: undefined,
					// ports: dbPod.ports,
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

				await agentManager.sendCommand(agentId, cluster.id, {
					id: "",
					type: Command_CommandType.CREATE_POD,
					payload: manifest,
					targetNamespace: dbPod.namespace,
					targetName: dbPod.name,
				});
				return;
			}

			// Check for Drifts in Existing Pods
			if (matchingPod.dockerImage !== dbPod.dockerImage) {
				console.log(
					`Syncing Pod ${dbPod.name}: Image mismatch detected (${matchingPod.dockerImage} vs ${dbPod.dockerImage})`,
				);

				let envVars: Record<string, string> | undefined;
				if (dbPod.envVariables) {
					try {
						envVars = JSON.parse(decrypt(dbPod.envVariables));
					} catch (e) {
						console.error("Failed to decrypt env vars", dbPod.name, e);
					}
				}

				const manifest = generatePodManifest({
					name: dbPod.name,
					namespace: dbPod.namespace,
					image: dbPod.dockerImage,
					command: dbPod.command ? dbPod.command.split(" ") : undefined,
					args: dbPod.args ? dbPod.args.split(" ") : undefined,
					labels:
						dbPod.labels && dbPod.labels !== ""
							? JSON.parse(dbPod.labels)
							: undefined,
					// ports: dbPod.ports,
					env: envVars,
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
				});

				await agentManager.sendCommand(agentId, cluster.id, {
					id: "",
					type: Command_CommandType.CREATE_POD, // This will overwrite/update the pod
					payload: manifest,
					targetNamespace: dbPod.namespace,
					targetName: dbPod.name,
				});
				return;
			}

			// Re-send DELETE if pod is still alive but marked as Terminating in DB
			if (matchingPod && dbPod.status === "Terminating") {
				console.log(
					`Pod ${dbPod.name} persists in cluster but is marked as Terminating in DB. Re-sending delete command.`,
				);
				await agentManager.sendCommand(agentId, cluster.id, {
					id: "",
					type: 6, // DELETE_POD
					targetNamespace: dbPod.namespace,
					targetName: dbPod.name,
					payload: "",
				});
				return;
			}
		}

		// 4. Validate Services (Source of Truth: k8sServices in DB)
		// Only sync services created by our app (not auto-discovered ones)
		const configuredServices = await db
			.select()
			.from(schema.k8sServices)
			.where(
				and(
					eq(schema.k8sServices.clusterId, cluster.id),
					or(isNull(schema.k8sServices.autoCreated), eq(schema.k8sServices.autoCreated, false)),
				),
			);

		const activeServices = heartbeat.services || [];

		for (const dbSvc of configuredServices) {
			const matchingService = activeServices.find(
				(s) => s.name === dbSvc.name && s.namespace === dbSvc.namespace,
			);

			if (!matchingService) {
				console.log(
					`Missing Service: ${dbSvc.name} in ${dbSvc.namespace}. Restoring...`,
				);

				// Construct Service Manifest (JSON is valid for ApplyManifest)
				const manifest = {
					apiVersion: "v1",
					kind: "Service",
					metadata: {
						name: dbSvc.name,
						namespace: dbSvc.namespace,
						labels: dbSvc.labels ? JSON.parse(dbSvc.labels) : {},
					},
					spec: {
						type: dbSvc.type || "ClusterIP",
						selector: dbSvc.selector ? JSON.parse(dbSvc.selector) : {},
						ports: dbSvc.ports,
					},
				};

				await agentManager.sendCommand(agentId, cluster.id, {
					id: "",
					type: Command_CommandType.CREATE_DEPLOYMENT, // Maps to ApplyManifest in Agent
					payload: YAML.stringify(manifest),
					targetNamespace: dbSvc.namespace,
					targetName: dbSvc.name,
				});
				return;
			}
		}

		// Sync ConfigMaps
		if (heartbeat.configMaps) {
			const defaultOwner = await db.query.profile.findFirst({
				where: {
					permission: {
						arrayContains: ["default-account"],
					},
				},
			});

			for (const cm of heartbeat.configMaps) {
				// 1. Try Find by UID
				let existing = await db
					.select()
					.from(k8sConfigMaps)
					.where(
						and(
							eq(k8sConfigMaps.clusterId, cluster.id),
							eq(k8sConfigMaps.k8sUid, cm.uid),
						),
					);

				// 2. Fallback to Name/Namespace
				if (existing.length === 0) {
					existing = await db
						.select()
						.from(k8sConfigMaps)
						.where(
							and(
								eq(k8sConfigMaps.clusterId, cluster.id),
								eq(k8sConfigMaps.name, cm.name),
								eq(k8sConfigMaps.namespace, cm.namespace),
							),
						);
				}

				console.log("existing", existing);

				// Prepare data
				const dataStr = JSON.stringify(cm.data);
				const encryptedData = encrypt(dataStr);

				let encryptedBinaryData = null;
				if (cm.binaryData && Object.keys(cm.binaryData).length > 0) {
					const binData: Record<string, string> = {};
					for (const [key, val] of Object.entries(cm.binaryData)) {
						binData[key] = Buffer.from(val).toString("base64");
					}
					encryptedBinaryData = encrypt(JSON.stringify(binData));
				}

				const cmData: InferInsertModel<typeof k8sConfigMaps> = {
					clusterId: cluster.id,
					name: cm.name,
					namespace: cm.namespace,
					data: encryptedData,
					binaryData: encryptedBinaryData,
					labels: JSON.stringify(cm.labels),
					k8sUid: cm.uid,
					updatedAt: new Date(),
				};

				if (existing.length > 0 && existing[0]?.k8sUid) {
					await db
						.update(k8sConfigMaps)
						.set(cmData)
						.where(eq(k8sConfigMaps.id, existing[0].id));
				} else if (defaultOwner) {
					await db.insert(k8sConfigMaps).values({
						...cmData,
						ownerId: defaultOwner.id,
						autoCreated: true, // created by agent when it detects a configmap not in DB
					});
				}
			}

			// Cleanup: remove auto-created configmaps no longer present in the cluster
			const heartbeatCmUids = new Set(
				heartbeat.configMaps.map((cm) => cm.uid).filter(Boolean),
			);
			const autoCreatedCms = await db
				.select()
				.from(k8sConfigMaps)
				.where(
					and(
						eq(k8sConfigMaps.clusterId, cluster.id),
						eq(k8sConfigMaps.autoCreated, true),
					),
				);
			for (const cm of autoCreatedCms) {
				if (cm.k8sUid && !heartbeatCmUids.has(cm.k8sUid)) {
					await db.delete(k8sConfigMaps).where(eq(k8sConfigMaps.id, cm.id));
				}
			}
		}

		// Sync Secrets
		if (heartbeat.secrets) {
			const defaultOwner = await db.query.profile.findFirst({
				where: {
					permission: {
						arrayContains: ["default-account"],
					},
				},
			});

			for (const sec of heartbeat.secrets) {
				// 1. Try Find by UID
				let existing = await db
					.select()
					.from(k8sSecrets)
					.where(
						and(
							eq(k8sSecrets.clusterId, cluster.id),
							eq(k8sSecrets.k8sUid, sec.uid),
						),
					);

				// 2. Fallback to Name/Namespace
				if (existing.length === 0) {
					existing = await db
						.select()
						.from(k8sSecrets)
						.where(
							and(
								eq(k8sSecrets.clusterId, cluster.id),
								eq(k8sSecrets.name, sec.name),
								eq(k8sSecrets.namespace, sec.namespace),
							),
						);
				}

				// Prepare data
				const binData: Record<string, string> = {};
				for (const [key, val] of Object.entries(sec.data)) {
					binData[key] = Buffer.from(val).toString("base64");
				}
				const encryptedData = encrypt(JSON.stringify(binData));

				const secData: InferInsertModel<typeof k8sSecrets> = {
					clusterId: cluster.id,
					name: sec.name,
					namespace: sec.namespace,
					type: sec.type,
					data: encryptedData,
					labels: JSON.stringify(sec.labels),
					k8sUid: sec.uid,
					updatedAt: new Date(),
				};

				if (existing.length > 0 && existing[0]?.k8sUid) {
					await db
						.update(k8sSecrets)
						.set(secData)
						.where(eq(k8sSecrets.id, existing[0].id));
				} else if (defaultOwner) {
					await db.insert(k8sSecrets).values({
						...secData,
						ownerId: defaultOwner.id,
						autoCreated: true, // created by agent when it detects a secret not in DB
					});
				}
			}

			// Cleanup: remove auto-created secrets no longer present in the cluster
			const heartbeatSecUids = new Set(
				heartbeat.secrets.map((s) => s.uid).filter(Boolean),
			);
			const autoCreatedSecs = await db
				.select()
				.from(k8sSecrets)
				.where(
					and(
						eq(k8sSecrets.clusterId, cluster.id),
						eq(k8sSecrets.autoCreated, true),
					),
				);
			for (const sec of autoCreatedSecs) {
				if (sec.k8sUid && !heartbeatSecUids.has(sec.k8sUid)) {
					await db.delete(k8sSecrets).where(eq(k8sSecrets.id, sec.id));
				}
			}
		}

		// 5. Validate ConfigMaps (Source of Truth: k8sConfigMaps in DB)
		// Only sync configmaps created by our app (not auto-discovered ones)
		const configuredConfigMaps = await db
			.select()
			.from(k8sConfigMaps)
			.where(
				and(
					eq(k8sConfigMaps.clusterId, cluster.id),
					or(isNull(k8sConfigMaps.autoCreated), eq(k8sConfigMaps.autoCreated, false)),
				),
			);

		const activeConfigMaps = heartbeat.configMaps || [];

		for (const dbCm of configuredConfigMaps) {
			const matchingCm = activeConfigMaps.find(
				(cm) => cm.name === dbCm.name && cm.namespace === dbCm.namespace,
			);

			if (!matchingCm) {
				console.log(
					`Missing ConfigMap: ${dbCm.name} in ${dbCm.namespace}. Restoring...`,
				);

				let data: Record<string, string> | undefined;
				if (dbCm.data) {
					try {
						data = JSON.parse(decrypt(dbCm.data));
					} catch (e) {
						console.error("Failed to decrypt configmap data", dbCm.name, e);
					}
				}

				let binaryData: Record<string, string> | undefined;
				if (dbCm.binaryData) {
					try {
						binaryData = JSON.parse(decrypt(dbCm.binaryData));
					} catch (e) {
						console.error(
							"Failed to decrypt configmap binaryData",
							dbCm.name,
							e,
						);
					}
				}

				const manifest = {
					apiVersion: "v1",
					kind: "ConfigMap",
					metadata: {
						name: dbCm.name,
						namespace: dbCm.namespace,
						labels: dbCm.labels ? JSON.parse(dbCm.labels) : {},
					},
					data: data,
					binaryData: binaryData,
				};

				await agentManager.sendCommand(agentId, cluster.id, {
					id: "",
					type: Command_CommandType.CREATE_CONFIGMAP,
					payload: YAML.stringify(manifest),
					targetNamespace: dbCm.namespace,
					targetName: dbCm.name,
				});
				return;
			}
		}

		// 6. Validate Secrets (Source of Truth: k8sSecrets in DB)
		// Only sync secrets created by our app (not auto-discovered ones)
		const configuredSecrets = await db
			.select()
			.from(k8sSecrets)
			.where(
				and(
					eq(k8sSecrets.clusterId, cluster.id),
					or(isNull(k8sSecrets.autoCreated), eq(k8sSecrets.autoCreated, false)),
				),
			);

		const activeSecrets = heartbeat.secrets || [];

		for (const dbSecret of configuredSecrets) {
			const matchingSecret = activeSecrets.find(
				(s) => s.name === dbSecret.name && s.namespace === dbSecret.namespace,
			);

			if (!matchingSecret) {
				console.log(
					`Missing Secret: ${dbSecret.name} in ${dbSecret.namespace}. Restoring...`,
				);

				let data: Record<string, string> | undefined;
				if (dbSecret.data) {
					try {
						data = JSON.parse(decrypt(dbSecret.data));
					} catch (e) {
						console.error("Failed to decrypt secret data", dbSecret.name, e);
					}
				}

				const manifest = {
					apiVersion: "v1",
					kind: "Secret",
					type: dbSecret.type || "Opaque",
					metadata: {
						name: dbSecret.name,
						namespace: dbSecret.namespace,
						labels: dbSecret.labels ? JSON.parse(dbSecret.labels) : {},
					},
					data: data,
				};

				await agentManager.sendCommand(agentId, cluster.id, {
					id: "",
					type: Command_CommandType.CREATE_SECRET,
					payload: YAML.stringify(manifest),
					targetNamespace: dbSecret.namespace,
					targetName: dbSecret.name,
				});
				return;
			}
		}

		return;
	}

	async getAgentByToken(token: string) {
		return await db.query.clusterAgent.findFirst({
			where: {
				token: token,
			},
		});
	}

	async agentDisconnect(agentId: number) {
		const agent = await db
			.update(clusterAgent)
			.set({
				lastSeenAt: new Date(),
			})
			.where(eq(clusterAgent.id, agentId))
			.returning();

		if (!agent || !agent[0]) {
			console.error(`No agent found for id ${agentId}`);
			return null;
		}

		const cluster = await db.query.k8sCluster.findFirst({
			where: {
				agentId: agent[0].id,
			},
		});

		if (!cluster) {
			console.error(`No cluster found for id ${agent[0].id}`);
			return null;
		}

		await db
			.update(k8sCluster)
			.set({
				status: "inactive",
			})
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

		if (portToUse === -1) {
			throw new Error("No available ports");
		}
		const [entry] = await db
			.insert(gatewayPorts)
			.values({
				clusterId,
				protocol,
				port: portToUse,
				allocated: true,
			})
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
