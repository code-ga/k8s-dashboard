import { db } from "../database";
import {
	clusterAgent,
	k8sCluster,
	k8sPods,
	k8sDeployments,
	k8sClusterNode,
	profile,
} from "../database/schema";
import { eq, and, isNull, type InferInsertModel } from "drizzle-orm";
import type {
	ServerPayload,
	Command,
	Heartbeat,
} from "../../pb-generated/agent-backend/websocket"; // Check imports carefully
import { Command_CommandType } from "../../pb-generated/agent-backend/websocket";
export class AgentService {
	// Process incoming heartbeat
	async handleHeartbeat(
		agentId: number,
		heartbeat: Heartbeat,
	): Promise<ServerPayload | null> {
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
			return null;
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
					.where(and(eq(k8sClusterNode.clusterId, cluster.id), eq(k8sClusterNode.k8sUid, node.uid)));

				// 2. Fallback to Name (to link new UID to existing record)
				if (existingNode.length === 0) {
					existingNode = await db
						.select()
						.from(k8sClusterNode)
						.where(and(eq(k8sClusterNode.clusterId, cluster.id), eq(k8sClusterNode.name, node.name)));
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
					.where(and(eq(k8sDeployments.clusterId, cluster.id), eq(k8sDeployments.k8sUid, dep.uid)));

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

				const depData: Omit<InferInsertModel<typeof k8sDeployments>, "ownerId"> = {
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
						.where(and(eq(k8sPods.clusterId, cluster.id), eq(k8sPods.k8sUid, pod.uid)));

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
						updatedAt: new Date(),
					};

					if (existingPodResult.length > 0 && existingPodResult[0]?.k8sUid) {
						await db
							.update(k8sPods)
							.set(podData)
							.where(eq(k8sPods.id, existingPodResult[0].id));
					} else {
						await db.insert(k8sPods).values(podData); // Fix lint: removed createdAt
					}
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

				// Construct Minimal Deployment Manifest
				const manifest = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${dbDep.name}
  namespace: ${dbDep.namespace}
  labels:
    app: ${dbDep.name}
spec:
  replicas: ${dbDep.replicas}
  selector:
    matchLabels:
      app: ${dbDep.name}
  template:
    metadata:
      labels:
        app: ${dbDep.name}
    spec:
      containers:
      - name: ${dbDep.name}
        image: ${dbDep.dockerImage}
        ports:
        - containerPort: ${dbDep.internalPort}
`;
				// Send CREATE (ApplyManifest) Command
				return {
					command: {
						id: crypto.randomUUID(),
						type: Command_CommandType.CREATE_DEPLOYMENT, // Maps to ApplyManifest in Agent
						payload: manifest,
						targetNamespace: dbDep.namespace,
						targetName: dbDep.name,
					},
				};
			}

			// If exists, check Replicas
			if (matchingDeployment.replicas !== dbDep.replicas) {
				console.log(
					`Mismatch for ${dbDep.name} in ${dbDep.namespace}: Wanted ${dbDep.replicas}, Got ${matchingDeployment.replicas}`,
				);

				return {
					command: {
						id: crypto.randomUUID(),
						type: Command_CommandType.SCALE_DEPLOYMENT,
						payload: dbDep.replicas.toString(),
						targetNamespace: dbDep.namespace,
						targetName: dbDep.name,
					},
				};
			}
		}

		// 3. Validate Pods (Bare Pods)
		const configuredPods = await db
			.select()
			.from(k8sPods)
			.where(and(eq(k8sPods.clusterId, cluster.id), isNull(k8sPods.deploymentId)));

		const activePods = heartbeat.pods || [];

		for (const dbPod of configuredPods) {
			const matchingPod = activePods.find(
				(p) => p.name === dbPod.name && p.namespace === dbPod.namespace,
			);

			if (!matchingPod) {
				console.log(`Missing Pod: ${dbPod.name} in ${dbPod.namespace}. Restoring...`);
				
				// Construct Minimal Pod Manifest
				const manifest = `
apiVersion: v1
kind: Pod
metadata:
  name: ${dbPod.name}
  namespace: ${dbPod.namespace}
spec:
  containers:
  - name: ${dbPod.name}
    image: ${dbPod.dockerImage}
    command: ${dbPod.command ? JSON.stringify(dbPod.command.split(" ")) : "null"}
    ports:
    - containerPort: ${dbPod.internalPort}
    resources:
      requests:
        cpu: "${dbPod.cpuRequest}m"
        memory: "${dbPod.memoryRequest}Mi"
      limits:
        cpu: "${dbPod.cpuLimit}m"
        memory: "${dbPod.memoryLimit}Mi"
`;
				return {
					command: {
						id: crypto.randomUUID(),
						type: Command_CommandType.CREATE_POD,
						payload: manifest,
						targetNamespace: dbPod.namespace,
						targetName: dbPod.name,
					},
				};
			}
		}

		return null;
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
}

export const agentService = new AgentService();
