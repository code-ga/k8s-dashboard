import { defineRelations } from "drizzle-orm";
import { AppState, gatewayPorts } from "./app";
import { agentCommands } from "./agent-commands";
import { account, profile, role, session, user, verification } from "./auth";
import { clusterAgent, k8sCluster, k8sClusterNode } from "./cluster";
import {
	deploymentConfigMapEnvFromRefs,
	deploymentConfigMapEnvRefs,
	deploymentConfigMapVolumeItems,
	deploymentConfigMapVolumeRefs,
	deploymentEmptyDirVolumeRefs,
	deploymentPorts,
	deploymentPvcVolumeRefs,
	deploymentSecretEnvFromRefs,
	deploymentSecretEnvRefs,
	deploymentSecretVolumeItems,
	deploymentSecretVolumeRefs,
	podConfigMapEnvFromRefs,
	podConfigMapEnvRefs,
	podConfigMapVolumeItems,
	podConfigMapVolumeRefs,
	podEmptyDirVolumeRefs,
	podPorts,
	podPvcVolumeRefs,
	podSecretEnvFromRefs,
	podSecretEnvRefs,
	podSecretVolumeItems,
	podSecretVolumeRefs,
} from "./k8s-normalized";
import {
	k8sConfigMaps,
	k8sDeployments,
	k8sIngresses,
	k8sPersistentVolumeClaims,
	k8sPods,
	k8sSecrets,
	k8sServices,
} from "./k8s-resources";

export const schema = {
	user,
	session,
	account,
	verification,
	profile,
	role,
	k8sCluster,
	clusterAgent,
	k8sPods,
	k8sClusterNode,
	k8sServices,
	k8sIngresses,
	k8sDeployments,
	k8sConfigMaps,
	k8sSecrets,
	k8sPersistentVolumeClaims,
	agentCommands,
	gatewayPorts,
	AppState,
	// Normalized reference tables
	podPorts,
	deploymentPorts,
	podConfigMapEnvRefs,
	podConfigMapEnvFromRefs,
	podConfigMapVolumeRefs,
	podConfigMapVolumeItems,
	podSecretEnvRefs,
	podSecretEnvFromRefs,
	podSecretVolumeRefs,
	podSecretVolumeItems,
	deploymentConfigMapEnvRefs,
	deploymentConfigMapEnvFromRefs,
	deploymentConfigMapVolumeRefs,
	deploymentConfigMapVolumeItems,
	deploymentSecretEnvRefs,
	deploymentSecretEnvFromRefs,
	deploymentSecretVolumeRefs,
	deploymentSecretVolumeItems,
	// PVC and EmptyDir volume references
	podPvcVolumeRefs,
	deploymentPvcVolumeRefs,
	podEmptyDirVolumeRefs,
	deploymentEmptyDirVolumeRefs,
} as const;

export const schemaRelations = defineRelations(schema, (r) => ({
	k8sCluster: {
		agent: r.one.clusterAgent({
			from: r.k8sCluster.agentId,
			to: r.clusterAgent.id,
		}),
		nodes: r.many.k8sClusterNode(),
		deployments: r.many.k8sDeployments(),
		services: r.many.k8sServices(),
		ingresses: r.many.k8sIngresses(),
		configMaps: r.many.k8sConfigMaps(),
		secrets: r.many.k8sSecrets(),
		pvcs: r.many.k8sPersistentVolumeClaims(),
		agentCommands: r.many.agentCommands(),
	},
	clusterAgent: {
		cluster: r.one.k8sCluster({
			from: r.clusterAgent.id,
			to: r.k8sCluster.agentId,
		}),
		commands: r.many.agentCommands(),
	},
	k8sPods: {
		node: r.one.k8sClusterNode({
			from: r.k8sPods.nodeId,
			to: r.k8sClusterNode.id,
		}),
		cluster: r.one.k8sCluster({
			from: r.k8sPods.clusterId,
			to: r.k8sCluster.id,
		}),
		deployment: r.one.k8sDeployments({
			from: r.k8sPods.deploymentId,
			to: r.k8sDeployments.id,
		}),
		owner: r.one.profile({
			from: r.k8sPods.ownerId,
			to: r.profile.id,
		}),
		// Normalized reference relations
		portRefs: r.many.podPorts(),
		configMapEnvRefs: r.many.podConfigMapEnvRefs(),
		configMapEnvFromRefs: r.many.podConfigMapEnvFromRefs(),
		configMapVolumeRefs: r.many.podConfigMapVolumeRefs(),
		secretEnvRefs: r.many.podSecretEnvRefs(),
		secretEnvFromRefs: r.many.podSecretEnvFromRefs(),
		secretVolumeRefs: r.many.podSecretVolumeRefs(),
		pvcVolumeRefs: r.many.podPvcVolumeRefs(),
		emptyDirVolumeRefs: r.many.podEmptyDirVolumeRefs(),
	},
	k8sServices: {
		node: r.one.k8sClusterNode({
			from: r.k8sServices.nodeId,
			to: r.k8sClusterNode.id,
		}),
		cluster: r.one.k8sCluster({
			from: r.k8sServices.clusterId,
			to: r.k8sCluster.id,
		}),
		pod: r.one.k8sPods({
			from: r.k8sServices.podId,
			to: r.k8sPods.id,
		}),
		owner: r.one.profile({
			from: r.k8sServices.ownerId,
			to: r.profile.id,
		}),
		ingresses: r.many.k8sIngresses({
			from: r.k8sServices.id,
			to: r.k8sIngresses.serviceId,
		}),
	},
	k8sIngresses: {
		cluster: r.one.k8sCluster({
			from: r.k8sIngresses.clusterId,
			to: r.k8sCluster.id,
		}),
		service: r.one.k8sServices({
			from: r.k8sIngresses.serviceId,
			to: r.k8sServices.id,
		}),
		owner: r.one.profile({
			from: r.k8sIngresses.ownerId,
			to: r.profile.id,
		}),
	},
	k8sClusterNode: {
		cluster: r.one.k8sCluster({
			from: r.k8sClusterNode.clusterId,
			to: r.k8sCluster.id,
		}),
		pods: r.many.k8sPods(),
		services: r.many.k8sServices(),
	},
	k8sDeployments: {
		cluster: r.one.k8sCluster({
			from: r.k8sDeployments.clusterId,
			to: r.k8sCluster.id,
		}),
		pods: r.many.k8sPods(),
		owner: r.one.profile({
			from: r.k8sDeployments.ownerId,
			to: r.profile.id,
		}),
		// Normalized reference relations
		portRefs: r.many.deploymentPorts(),
		configMapEnvRefs: r.many.deploymentConfigMapEnvRefs(),
		configMapEnvFromRefs: r.many.deploymentConfigMapEnvFromRefs(),
		configMapVolumeRefs: r.many.deploymentConfigMapVolumeRefs(),
		secretEnvRefs: r.many.deploymentSecretEnvRefs(),
		secretEnvFromRefs: r.many.deploymentSecretEnvFromRefs(),
		secretVolumeRefs: r.many.deploymentSecretVolumeRefs(),
		pvcVolumeRefs: r.many.deploymentPvcVolumeRefs(),
		emptyDirVolumeRefs: r.many.deploymentEmptyDirVolumeRefs(),
	},
	profile: {
		user: r.one.user({
			from: r.profile.userId,
			to: r.user.id,
		}),
		roles: r.many.role({
			from: r.profile.id,
			to: r.role.profileIds,
		}),
	},
	role: {
		profiles: r.many.profile({
			from: r.role.profileIds,
			to: r.profile.id,
		}),
	},
	user: {
		profile: r.one.profile({
			from: r.user.id,
			to: r.profile.userId,
		}),
	},
	agentCommands: {
		agent: r.one.clusterAgent({
			from: r.agentCommands.agentId,
			to: r.clusterAgent.id,
		}),
		cluster: r.one.k8sCluster({
			from: r.agentCommands.clusterId,
			to: r.k8sCluster.id,
		}),
	},
	gatewayPorts: {
		cluster: r.one.k8sCluster({
			from: r.gatewayPorts.clusterId,
			to: r.k8sCluster.id,
		}),
		service: r.one.k8sServices({
			from: r.gatewayPorts.serviceId,
			to: r.k8sServices.id,
		}),
	},
	k8sConfigMaps: {
		cluster: r.one.k8sCluster({
			from: r.k8sConfigMaps.clusterId,
			to: r.k8sCluster.id,
		}),
		owner: r.one.profile({
			from: r.k8sConfigMaps.ownerId,
			to: r.profile.id,
		}),
	},
	k8sSecrets: {
		cluster: r.one.k8sCluster({
			from: r.k8sSecrets.clusterId,
			to: r.k8sCluster.id,
		}),
		owner: r.one.profile({
			from: r.k8sSecrets.ownerId,
			to: r.profile.id,
		}),
	},
	k8sPersistentVolumeClaims: {
		cluster: r.one.k8sCluster({
			from: r.k8sPersistentVolumeClaims.clusterId,
			to: r.k8sCluster.id,
		}),
		owner: r.one.profile({
			from: r.k8sPersistentVolumeClaims.ownerId,
			to: r.profile.id,
		}),
	},
	// Reverse relations for normalized reference tables
	podPorts: {
		pod: r.one.k8sPods({
			from: r.podPorts.podId,
			to: r.k8sPods.id,
		}),
	},
	deploymentPorts: {
		deployment: r.one.k8sDeployments({
			from: r.deploymentPorts.deploymentId,
			to: r.k8sDeployments.id,
		}),
	},
	podConfigMapEnvRefs: {
		pod: r.one.k8sPods({
			from: r.podConfigMapEnvRefs.podId,
			to: r.k8sPods.id,
		}),
	},
	podConfigMapEnvFromRefs: {
		pod: r.one.k8sPods({
			from: r.podConfigMapEnvFromRefs.podId,
			to: r.k8sPods.id,
		}),
	},
	podConfigMapVolumeRefs: {
		pod: r.one.k8sPods({
			from: r.podConfigMapVolumeRefs.podId,
			to: r.k8sPods.id,
		}),
		items: r.many.podConfigMapVolumeItems(),
	},
	podConfigMapVolumeItems: {
		volumeRef: r.one.podConfigMapVolumeRefs({
			from: r.podConfigMapVolumeItems.volumeRefId,
			to: r.podConfigMapVolumeRefs.id,
		}),
	},
	podSecretEnvRefs: {
		pod: r.one.k8sPods({
			from: r.podSecretEnvRefs.podId,
			to: r.k8sPods.id,
		}),
	},
	podSecretEnvFromRefs: {
		pod: r.one.k8sPods({
			from: r.podSecretEnvFromRefs.podId,
			to: r.k8sPods.id,
		}),
	},
	podSecretVolumeRefs: {
		pod: r.one.k8sPods({
			from: r.podSecretVolumeRefs.podId,
			to: r.k8sPods.id,
		}),
		items: r.many.podSecretVolumeItems(),
	},
	podSecretVolumeItems: {
		volumeRef: r.one.podSecretVolumeRefs({
			from: r.podSecretVolumeItems.volumeRefId,
			to: r.podSecretVolumeRefs.id,
		}),
	},
	deploymentConfigMapEnvRefs: {
		deployment: r.one.k8sDeployments({
			from: r.deploymentConfigMapEnvRefs.deploymentId,
			to: r.k8sDeployments.id,
		}),
	},
	deploymentConfigMapEnvFromRefs: {
		deployment: r.one.k8sDeployments({
			from: r.deploymentConfigMapEnvFromRefs.deploymentId,
			to: r.k8sDeployments.id,
		}),
	},
	deploymentConfigMapVolumeRefs: {
		deployment: r.one.k8sDeployments({
			from: r.deploymentConfigMapVolumeRefs.deploymentId,
			to: r.k8sDeployments.id,
		}),
		items: r.many.deploymentConfigMapVolumeItems(),
	},
	deploymentConfigMapVolumeItems: {
		volumeRef: r.one.deploymentConfigMapVolumeRefs({
			from: r.deploymentConfigMapVolumeItems.volumeRefId,
			to: r.deploymentConfigMapVolumeRefs.id,
		}),
	},
	deploymentSecretEnvRefs: {
		deployment: r.one.k8sDeployments({
			from: r.deploymentSecretEnvRefs.deploymentId,
			to: r.k8sDeployments.id,
		}),
	},
	deploymentSecretEnvFromRefs: {
		deployment: r.one.k8sDeployments({
			from: r.deploymentSecretEnvFromRefs.deploymentId,
			to: r.k8sDeployments.id,
		}),
	},
	deploymentSecretVolumeRefs: {
		deployment: r.one.k8sDeployments({
			from: r.deploymentSecretVolumeRefs.deploymentId,
			to: r.k8sDeployments.id,
		}),
		items: r.many.deploymentSecretVolumeItems(),
	},
	deploymentSecretVolumeItems: {
		volumeRef: r.one.deploymentSecretVolumeRefs({
			from: r.deploymentSecretVolumeItems.volumeRefId,
			to: r.deploymentSecretVolumeRefs.id,
		}),
	},
	// PVC Volume References
	podPvcVolumeRefs: {
		pod: r.one.k8sPods({
			from: r.podPvcVolumeRefs.podId,
			to: r.k8sPods.id,
		}),
	},
	deploymentPvcVolumeRefs: {
		deployment: r.one.k8sDeployments({
			from: r.deploymentPvcVolumeRefs.deploymentId,
			to: r.k8sDeployments.id,
		}),
	},
	// EmptyDir Volume References
	podEmptyDirVolumeRefs: {
		pod: r.one.k8sPods({
			from: r.podEmptyDirVolumeRefs.podId,
			to: r.k8sPods.id,
		}),
	},
	deploymentEmptyDirVolumeRefs: {
		deployment: r.one.k8sDeployments({
			from: r.deploymentEmptyDirVolumeRefs.deploymentId,
			to: r.k8sDeployments.id,
		}),
	},
}));
