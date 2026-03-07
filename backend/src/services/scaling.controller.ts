import { logger } from "../utils/logger";
import { and, eq, gt } from "drizzle-orm";
import { Command_CommandType } from "../../pb-generated/agent-backend/websocket";
import { db } from "../database";
import { clusterAgent, k8sCluster, k8sDeployments } from "../database/schema";
import { agentManager } from "./agentManager";

export class ScalingController {
	private interval: NodeJS.Timeout | null = null;

	start(checkIntervalMs = 60000) {
		if (this.interval) return;
		this.interval = setInterval(
			() => this.checkIdleDeployments(),
			checkIntervalMs,
		);
		logger.info("Scaling Controller started.");
	}

	stop() {
		if (this.interval) {
			clearInterval(this.interval);
			this.interval = null;
		}
	}

	async checkIdleDeployments() {
		try {
			const now = new Date();

			// Using standard joins for better type safety
			const idleDeployments = await db
				.select({
					deployment: k8sDeployments,
					agentId: clusterAgent.id,
					clusterId: k8sCluster.id,
				})
				.from(k8sDeployments)
				.innerJoin(k8sCluster, eq(k8sDeployments.clusterId, k8sCluster.id))
				.innerJoin(clusterAgent, eq(k8sCluster.agentId, clusterAgent.id))
				.where(
					and(
						eq(k8sDeployments.isAutoScaling, true),
						gt(k8sDeployments.replicas, 0),
					),
				);

			for (const row of idleDeployments) {
				const dep = row.deployment;
				if (!dep.lastAccessedAt || !dep.idleTimeoutSeconds) continue;

				const lastAccessed = new Date(dep.lastAccessedAt);
				const idleTimeSeconds = (now.getTime() - lastAccessed.getTime()) / 1000;

				if (idleTimeSeconds > dep.idleTimeoutSeconds) {
					logger.info(
						`Scaling down idle deployment: ${dep.name} in namespace ${dep.namespace}`,
					);

					try {
						await agentManager.sendCommand(row.agentId, row.clusterId, {
							id: crypto.randomUUID(),
							type: Command_CommandType.SCALE_DEPLOYMENT,
							payload: "0",
							targetNamespace: dep.namespace,
							targetName: dep.name,
						});

						await db
							.update(k8sDeployments)
							.set({ replicas: 0 })
							.where(eq(k8sDeployments.id, dep.id));
					} catch (err) {
						logger.error(`Failed to scale down deployment ${dep.name}:`, err);
					}
				}
			}

			// Enforcement for isAlwaysRunning deployments
			const forcedRunning = await db
				.select({
					deployment: k8sDeployments,
					agentId: clusterAgent.id,
					clusterId: k8sCluster.id,
				})
				.from(k8sDeployments)
				.innerJoin(k8sCluster, eq(k8sDeployments.clusterId, k8sCluster.id))
				.innerJoin(clusterAgent, eq(k8sCluster.agentId, clusterAgent.id))
				.where(
					and(
						eq(k8sDeployments.isAlwaysRunning, true),
						eq(k8sDeployments.replicas, 0),
					),
				);

			for (const row of forcedRunning) {
				const dep = row.deployment;
				logger.info(
					`Enforcing 'Always Running' for: ${dep.name} in namespace ${dep.namespace}`,
				);

				try {
					await agentManager.sendCommand(row.agentId, row.clusterId, {
						id: crypto.randomUUID(),
						type: Command_CommandType.SCALE_DEPLOYMENT,
						payload: "1",
						targetNamespace: dep.namespace,
						targetName: dep.name,
					});

					await db
						.update(k8sDeployments)
						.set({ replicas: 1, lastAccessedAt: new Date() })
						.where(eq(k8sDeployments.id, dep.id));
				} catch (err) {
					logger.error(`Failed to enforce running for ${dep.name}:`, err);
				}
			}
		} catch (error) {
			logger.error("Error in ScalingController check:", error);
		}
	}

	async wakeUpDeployment(deploymentId: number) {
		const result = await db
			.select({
				deployment: k8sDeployments,
				agentId: clusterAgent.id,
				clusterId: k8sCluster.id,
			})
			.from(k8sDeployments)
			.innerJoin(k8sCluster, eq(k8sDeployments.clusterId, k8sCluster.id))
			.innerJoin(clusterAgent, eq(k8sCluster.agentId, clusterAgent.id))
			.where(eq(k8sDeployments.id, deploymentId))
			.limit(1);

		const row = result[0];
		if (!row) {
			throw new Error("Deployment or agent not found");
		}

		const dep = row.deployment;
		if (dep.replicas > 0) {
			await db
				.update(k8sDeployments)
				.set({ lastAccessedAt: new Date() })
				.where(eq(k8sDeployments.id, dep.id));
			return;
		}

		logger.info(`Waking up deployment: ${dep.name}`);

		await agentManager.sendCommand(row.agentId, row.clusterId, {
			id: crypto.randomUUID(),
			type: Command_CommandType.SCALE_DEPLOYMENT,
			payload: "1",
			targetNamespace: dep.namespace,
			targetName: dep.name,
		});

		await db
			.update(k8sDeployments)
			.set({
				replicas: 1,
				lastAccessedAt: new Date(),
			})
			.where(eq(k8sDeployments.id, dep.id));
	}
}

export const scalingController = new ScalingController();
