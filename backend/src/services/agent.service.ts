
import { db } from "../database";
import { clusterAgent, k8sCluster, k8sPods, k8sDeployments } from "../database/schema";
import { eq } from "drizzle-orm";
import  type { ServerPayload, Command, Heartbeat } from "../../pb-generated/agent-backend/websocket"; // Check imports carefully
import { Command_CommandType } from "../../pb-generated/agent-backend/websocket";
export class AgentService {
    
    // Process incoming heartbeat
    async handleHeartbeat(agentId: number, heartbeat: Heartbeat): Promise<ServerPayload | null> {
        console.log(`Processing heartbeat for agent ${agentId}`);

        // 1. Update Cluster Stats (CPU/RAM Usage)
        // We need to find the cluster associated with this agent
        const cluster = await db.query.k8sCluster.findFirst({
            where: eq(k8sCluster.agentId, agentId)
        });

        if (!cluster) {
            console.error(`No cluster found for agent ${agentId}`);
            return null;
        }

        // Update real-time stats
        if (heartbeat.clusterResource) {
            await db.update(k8sCluster).set({
                cpuUsage: Number(heartbeat.clusterResource.cpuUsage),
                ramUsage: Number(heartbeat.clusterResource.ramUsage),
                cpuCapacity: Number(heartbeat.clusterResource.cpuCapacity),
                ramCapacity: Number(heartbeat.clusterResource.ramCapacity),
                updatedAt: new Date(),
                status: "active"
            }).where(eq(k8sCluster.id, cluster.id));
        }

        // Sync Deployments
        if (heartbeat.deployments) {
            // Very simple sync: upsert based on name + clusterId (assuming name is unique per cluster for now, or name+namespace unique)
            // Ideally we delete ones that no longer exist, but for now lets just upsert active ones.
            for (const dep of heartbeat.deployments) {
                 const existing = await db.query.k8sDeployments.findFirst({
                     where: (d, { eq, and }) => and(
                         eq(d.clusterId, cluster.id),
                         eq(d.name, dep.name),
                         eq(d.namespace, dep.namespace)
                     )
                 });
                 
                 const depData = {
                     clusterId: cluster.id,
                     name: dep.name,
                     namespace: dep.namespace,
                     replicas: dep.replicas,
                     availableReplicas: dep.availableReplicas,
                     unavailableReplicas: dep.unavailableReplicas,
                     dockerImage: dep.dockerImage,
                     labels: JSON.stringify(dep.labels),
                     selector: JSON.stringify(dep.selector),
                     updatedAt: new Date(),
                 };

                 if (existing) {
                     // Only update status fields to preserve DB as source of truth for config
                     await db.update(k8sDeployments)
                        .set({
                            availableReplicas: dep.availableReplicas,
                            unavailableReplicas: dep.unavailableReplicas,
                            updatedAt: new Date(),
                        })
                        .where(eq(k8sDeployments.id, existing.id));
                 } else {
                     await db.insert(k8sDeployments).values(depData);
                 }
            }
        }

        // 2. Validate Deployments (Source of Truth: k8sDeployments in DB)
        const configuredDeployments = await db.query.k8sDeployments.findMany({
            where: eq(k8sDeployments.clusterId, cluster.id)
        });

        const activeDeployments = heartbeat.deployments || [];

        for (const dbDep of configuredDeployments) {
            // Find corresponding deployment
            const matchingDeployment = activeDeployments.find(d => 
                d.name === dbDep.name && d.namespace === dbDep.namespace
            );

            if (!matchingDeployment) {
                console.log(`Missing Deployment: ${dbDep.name} in ${dbDep.namespace}. Creating...`);
                
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
                        targetName: dbDep.name
                    }
                };
            }

            // If exists, check Replicas
            if (matchingDeployment.replicas !== dbDep.replicas) {
                console.log(`Mismatch for ${dbDep.name} in ${dbDep.namespace}: Wanted ${dbDep.replicas}, Got ${matchingDeployment.replicas}`);
                
                return {
                   command: {
                        id: crypto.randomUUID(),
                        type: Command_CommandType.SCALE_DEPLOYMENT,
                        payload: dbDep.replicas.toString(),
                        targetNamespace: dbDep.namespace,
                        targetName: dbDep.name,
                   }
                };
            }
        }

        // 3. Check for CREATE (Pod in DB but not in Heartbeat at all)
        // Only if we treat DB as source of truth for deployments
        // ... (This logic depends on how strict we want to be. 
        // If we strictly enforce DB state, we might auto-create. 
        // For now, let's stick to SCALING correction as proof of concept).

        return null;
    }

    async getAgentByToken(token: string) {
        return await db.query.clusterAgent.findFirst({
            where: eq(clusterAgent.token, token)
        });
    }

    async agentDisconnect(agentId: number) {
        const agent = await db.update(clusterAgent).set({
            lastSeenAt: new Date(),
        }).where(eq(clusterAgent.id, agentId)).returning();

        if (!agent || !agent[0]) {
            console.error(`No agent found for id ${agentId}`);
            return null;
        }

        const cluster = await db.query.k8sCluster.findFirst({
            where: eq(k8sCluster.agentId, agent[0].id),
        });

        if (!cluster) {
            console.error(`No cluster found for id ${agent[0].id}`);
            return null;
        }

        await db.update(k8sCluster).set({
            status: "inactive",
        }).where(eq(k8sCluster.id, cluster.id));

        return agent[0];
    }
}

export const agentService = new AgentService();
