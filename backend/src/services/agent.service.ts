import { db } from "../database";
import {
	clusterAgent,
	k8sCluster,
	k8sPods,
	k8sDeployments,
	k8sClusterNode,
	gatewayPorts,
	schema,
} from "../database/schema";
import { eq, and, isNull, type InferInsertModel } from "drizzle-orm";
import type {
	Heartbeat,
	// Command,
} from "../../pb-generated/agent-backend/websocket"; // Check imports carefully
import { Command_CommandType } from "../../pb-generated/agent-backend/websocket";
import YAML from "yaml";
import type { AgentManager } from "./agentManager";
import { decrypt } from "../utils/crypto";
import {
	generateDeploymentManifest,
	generatePodManifest,
} from "../utils/k8s-manifest";
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
					await db.insert(k8sClusterNode).values(nodeData);
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
					await db.insert(k8sDeployments).values({
						...depData,
						ownerId: defaultOwner.id,
					});
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
						envVariables: pod.envVariables || "",
						internalPort: pod.internalPort,
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
					} else {
						await db.insert(k8sPods).values(podData); // Fix lint: removed createdAt
					}
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
					await db.insert(schema.k8sServices).values(svcData);
				}
			}
		}

		// 2. Validate Deployments (Source of Truth: k8sDeployments in DB)
		const configuredDeployments = await db.query.k8sDeployments.findMany({
			where: {
				clusterId: cluster.id,
			},
		});

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
					// internalPort conversion. DB has int, DTO has ports[{containerPort}]
					ports: [{ containerPort: dbDep.internalPort }],
					env: envVars,
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
					ports: [{ containerPort: dbDep.internalPort }],
					env: envVars,
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
		const configuredPods = await db
			.select()
			.from(k8sPods)
			.where(
				and(eq(k8sPods.clusterId, cluster.id), isNull(k8sPods.deploymentId)),
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
					ports: [{ containerPort: dbPod.internalPort }],
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
					ports: [{ containerPort: dbPod.internalPort }],
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
		const configuredServices = await db.query.k8sServices.findMany({
			where: {
				clusterId: cluster.id,
			},
		});

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
