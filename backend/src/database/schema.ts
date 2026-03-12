// ALERT: user table only for auth, profile table for user data

import { defineRelations, is } from "drizzle-orm";
import {
	boolean,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	serial,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

export const user = pgTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified").default(false).notNull(),
	image: text("image"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});

export const session = pgTable("session", {
	id: text("id").primaryKey(),
	expiresAt: timestamp("expires_at").notNull(),
	token: text("token").notNull().unique(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
	id: text("id").primaryKey(),
	accountId: text("account_id").notNull(),
	providerId: text("provider_id").notNull(),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	accessTokenExpiresAt: timestamp("access_token_expires_at"),
	refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
	scope: text("scope"),
	password: text("password"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});

export const verification = pgTable("verification", {
	id: text("id").primaryKey(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: timestamp("expires_at").notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});
export const role = pgTable("role", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	name: text("name").notNull().unique().unique(),
	description: text("description"),
	permissions: text("permissions").array().default([]).notNull(), // ["cluster:read", ...]
	profileIds: text("profile_ids").array().default([]).notNull(), // relation to profile table, a role can belong to multiple profiles
	isDefault: boolean("is_default").default(false).notNull(),
	adminRole: boolean("admin_role").default(false).notNull(), // whether this role is the admin role with all permissions
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.$onUpdate(() => new Date())
		.notNull(),
});
export const profile = pgTable("profile", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" })
		.unique(),
	createdAt: timestamp("created_at").defaultNow().notNull(),

	username: text("username").notNull(),
	rolesIDs: text("roles")
		.array()
		.default([])
		.notNull(), // relation to role table (FKs on arrays not supported by PG directly)

	isSystemDefault: boolean("is_system_default").default(false).notNull(),

	updatedAt: timestamp("updated_at")
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});

export const clusterAgent = pgTable("clusterAgent", {
	id: serial("id").primaryKey(),
	token: text("token")
		.notNull()
		.unique()
		.$defaultFn(() => crypto.randomUUID()),
	lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});

export const agentCommandStatus = pgEnum("agent_command_status", [
	"pending",
	"sent",
	"success",
	"failed",
	"timeout",
]);

export const agentCommands = pgTable("agentCommands", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	agentId: integer("agent_id")
		.notNull()
		.references(() => clusterAgent.id, { onDelete: "cascade" }),
	clusterId: integer("cluster_id")
		.notNull()
		.references(() => k8sCluster.id, { onDelete: "cascade" }),
	type: text("type").notNull(),
	payload: jsonb("payload").notNull(),
	status: agentCommandStatus("status").default("pending").notNull(),

	result: jsonb("result"),
	errorMessage: text("error_message"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});

export const clusterStatus = pgEnum("cluster_status", ["active", "inactive"]);
export const k8sCluster = pgTable("k8sCluster", {
	id: serial("id").primaryKey(),
	name: text("name").notNull(),
	description: text("description"),
	tags: text("tags").array().default([]).notNull(),
	// ownerId: text("owner_id")
	// 	.notNull()
	// 	.references(() => user.id, { onDelete: "cascade" }),
	clusterDomain: text("cluster_domain").notNull(),
	status: clusterStatus().notNull().default("inactive"),

	agentId: integer("agent_id")
		.notNull()
		.references(() => clusterAgent.id, { onDelete: "cascade" }),
	nodeIds: integer("node_id").notNull().array().default([]),
	// .references(() => k8sClusterNode.id, { onDelete: "cascade" }),

	enableS3Service: boolean("enable_s3_service").default(false).notNull(),
	s3AdminSecretKey: text("s3_admin_secret_key"),
	ramCapacity: integer("ram_capacity").notNull().default(1000000000),
	cpuCapacity: integer("cpu_capacity").notNull().default(1000000000),
	cpuUsage: integer("cpu_usage").notNull().default(0),
	ramUsage: integer("ram_usage").notNull().default(0),
	internalClusterDomain: text("internal_cluster_domain")
		.notNull()
		.default("cluster.local"),
	// ACME / Let's Encrypt email used by Traefik for certificate registration.
	// When set the agent uses this email instead of the ACME_EMAIL env var.
	acmeEmail: text("acme_email"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});

export const k8sClusterNode = pgTable(
	"k8sClusterNode",
	{
		id: serial("id").primaryKey(),
		clusterId: integer("cluster_id")
			.notNull()
			.references(() => k8sCluster.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		cpuUsage: integer("cpu_usage").notNull(),
		ramUsage: integer("ram_usage").notNull(),
		cpuCapacity: integer("cpu_capacity").notNull(),
		ramCapacity: integer("ram_capacity").notNull(),
		labels: text("labels").notNull(),
		status: text("status").notNull().default("Unknown"),
		roles: text("roles").array().notNull().default([]),
		publicIp: text("public_ip"), // the public ip of node if node is in cloud
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
		k8sUid: text("k8s_uid"),
		autoCreated: boolean("auto_created").default(false).notNull(), // whether this node is auto created by agent when it reports a new node name
	},
	(table) => ({
		clusterUidIdx: uniqueIndex("node_cluster_uid_idx").on(
			table.clusterId,
			table.k8sUid,
		),
	}),
);

export const k8sDeployments = pgTable(
	"k8sDeployments",
	{
		id: serial("id").primaryKey(),
		clusterId: integer("cluster_id")
			.notNull()
			.references(() => k8sCluster.id, { onDelete: "cascade" }),

		ownerId: text("owner_id")
			.notNull()
			.references(() => profile.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		namespace: text("namespace").notNull(),
		replicas: integer("replicas").notNull(),
		availableReplicas: integer("available_replicas").notNull(),
		unavailableReplicas: integer("unavailable_replicas").notNull(),
		dockerImage: text("docker_image").notNull(),
		labels: text("labels"), // JSON string
		selector: text("selector"), // JSON string

		// Spec fields moved from k8sPods
		cpuRequest: integer("cpu_request").default(0).notNull(),
		cpuLimit: integer("cpu_limit").default(0).notNull(),
		memoryRequest: integer("memory_request").default(0).notNull(),
		memoryLimit: integer("memory_limit").default(0).notNull(),
		command: text("command").default("").notNull(),
		args: text("args").default("").notNull(),
		envVariables: text("env_variables").default("").notNull(),
		ports: jsonb("ports").$type<any>().default([]).notNull(),

		// ConfigMap and Secret references
		configMapRefs: jsonb("configmap_refs")
			.$type<{
				env?: Array<{ name: string; configMapName: string; key: string }>;
				envFrom?: Array<{ configMapName: string; prefix?: string }>;
				volumes?: Array<{
					name: string;
					configMapName: string;
					mountPath: string;
					items?: Array<{ key: string; path: string }>;
				}>;
			}>()
			.default({ env: [], envFrom: [], volumes: [] }),
		secretRefs: jsonb("secret_refs")
			.$type<{
				env?: Array<{ name: string; secretName: string; key: string }>;
				envFrom?: Array<{ secretName: string; prefix?: string }>;
				volumes?: Array<{
					name: string;
					secretName: string;
					mountPath: string;
					items?: Array<{ key: string; path: string }>;
				}>;
			}>()
			.default({ env: [], envFrom: [], volumes: [] }),

		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
		k8sUid: text("k8s_uid"),
		idleTimeoutSeconds: integer("idle_timeout_seconds").default(0).notNull(),
		lastAccessedAt: timestamp("last_accessed_at"),
		isAutoScaling: boolean("is_auto_scaling").default(false).notNull(),
		isAlwaysRunning: boolean("is_always_running").default(false).notNull(),

		autoCreated: boolean("is_auto_created").default(false).notNull(), // create by agent when it detects a deployment not in DB
	},
	(table) => ({
		clusterUidIdx: uniqueIndex("dep_cluster_uid_idx").on(
			table.clusterId,
			table.k8sUid,
		),
	}),
);

export const k8sPods = pgTable(
	"k8sPods",
	{
		id: serial("id").primaryKey(),
		clusterId: integer("cluster_id")
			.notNull()
			.references(() => k8sCluster.id, { onDelete: "cascade" }),
		deploymentId: integer("deployment_id").references(() => k8sDeployments.id, {
			onDelete: "set null",
		}), // Pods can exist without deployment (bare pods)
		nodeId: integer("node_id") // Can be null if pending? Schema says serial (autoincrement) which implies NOT NULL usually in Drizzle unless specified.
			// Existing schema had it as serial and references k8sClusterNode.
			.references(() => k8sClusterNode.id, { onDelete: "cascade" }),
		ownerId: text("owner_id")
			.notNull()
			.references(() => profile.id, { onDelete: "cascade" }),

		name: text("name").notNull(),
		namespace: text("namespace").notNull(),
		dockerImage: text("docker_image").notNull(),
		// replicas removed
		cpuRequest: integer("cpu_request").notNull(),
		cpuLimit: integer("cpu_limit").notNull(),
		memoryRequest: integer("memory_request").notNull(),
		memoryLimit: integer("memory_limit").notNull(),
		// Keep these on pod for actual usage/status? Or remove if we only care about spec on Deployment?
		// User asked to reconstruct "like k8s architecture". K8s Pods have specs.
		// But specifically "only deployment have the replicas".
		// I will keep resource specs on Pods as they reflect the actual pod spec (which might differ during updates).
		command: text("command").notNull(),
		args: text("args").default("").notNull(),
		envVariables: text("env_variables").notNull(),
		labels: text("labels").default("").notNull(), // JSON string

		// ports: jsonb("ports").$type<any>().default([]).notNull(),

		// this definitely needs to be refactored into separate tables for env and volume refs, but for now we can keep it as jsonb
		// ConfigMap and Secret references
		// configMapRefs: jsonb("configmap_refs")
		// 	.$type<{
		// 		env?: Array<{ name: string; configMapName: string; key: string }>;
		// 		envFrom?: Array<{ configMapName: string; prefix?: string }>;
		// 		volumes?: Array<{
		// 			name: string;
		// 			configMapName: string;
		// 			mountPath: string;
		// 			items?: Array<{ key: string; path: string }>;
		// 		}>;
		// 	}>()
		// 	.default({ env: [], envFrom: [], volumes: [] }),
		// secretRefs: jsonb("secret_refs")
		// 	.$type<{
		// 		env?: Array<{ name: string; secretName: string; key: string }>;
		// 		envFrom?: Array<{ secretName: string; prefix?: string }>;
		// 		volumes?: Array<{
		// 			name: string;
		// 			secretName: string;
		// 			mountPath: string;
		// 			items?: Array<{ key: string; path: string }>;
		// 		}>;
		// 	}>()
		// 	.default({ env: [], envFrom: [], volumes: [] }),

		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
		k8sUid: text("k8s_uid"),
		status: text("status").notNull().default("Unknown"),
		cpuUsage: integer("cpu_usage").default(0).notNull(),
		memoryUsage: integer("memory_usage").default(0).notNull(),
		autoCreated: boolean("is_auto_created").default(false).notNull(), // created by agent when it detects a pod not in DB
	},
	(table) => ({
		clusterUidIdx: uniqueIndex("pod_cluster_uid_idx").on(
			table.clusterId,
			table.k8sUid,
		),
	}),
);

export const k8sServices = pgTable(
	"k8sServices",
	{
		id: serial("id").primaryKey(),
		clusterId: integer("cluster_id")
			.notNull()
			.references(() => k8sCluster.id, { onDelete: "cascade" }),
		nodeId: integer("node_id").references(() => k8sClusterNode.id, {
			onDelete: "set null",
		}),
		podId: integer("pod_id").references(() => k8sPods.id, {
			onDelete: "set null",
		}),
		ownerId: text("owner_id").references(() => profile.id, {
			onDelete: "set null",
		}),

		name: text("name").notNull(),
		namespace: text("namespace").notNull(),
		type: text("type"),
		clusterIp: text("cluster_ip"),
		selector: text("selector"), // JSON string
		labels: text("labels").notNull(),
		ports: jsonb("ports").$type<any[]>().notNull(), // Array of ServicePortDTO

		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
		k8sUid: text("k8s_uid"),
		status: text("status").notNull().default("Unknown"),

		autoCreated: boolean("is_auto_created").default(false).notNull(), // created by agent when it detects a service not in DB
	},
	(table) => ({
		clusterUidIdx: uniqueIndex("svc_cluster_uid_idx").on(
			table.clusterId,
			table.k8sUid,
		),
	}),
);

export const k8sIngresses = pgTable(
	"k8sIngresses",
	{
		id: serial("id").primaryKey(),
		clusterId: integer("cluster_id")
			.notNull()
			.references(() => k8sCluster.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		namespace: text("namespace").notNull(),
		serviceId: integer("service_id")
			.references(() => k8sServices.id, {
				onDelete: "set null",
			})
			.notNull(),
		ownerId: text("owner_id").references(() => profile.id, {
			onDelete: "set null",
		}),
		serviceName: text("service_name"),
		domain: text("domain"),
		port: integer("port"), // gateway port
		protocol: text("protocol"), // http | tcp | udp
		path: text("path"),
		k8sUid: text("k8s_uid"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),

		autoCreated: boolean("is_auto_created").default(false).notNull(), // created by agent when it detects an ingress not in DB
	},
	(table) => ({
		clusterNameNamespaceIdx: uniqueIndex("ing_cluster_name_namespace_idx").on(
			table.clusterId,
			table.name,
			table.namespace,
		),
	}),
);

export const k8sConfigMaps = pgTable(
	"k8sConfigMaps",
	{
		id: serial("id").primaryKey(),
		clusterId: integer("cluster_id")
			.notNull()
			.references(() => k8sCluster.id, { onDelete: "cascade" }),
		ownerId: text("owner_id").references(() => profile.id, {
			onDelete: "set null",
		}),
		name: text("name").notNull(),
		namespace: text("namespace").notNull(),
		data: text("data"), // Encrypted JSON string
		binaryData: text("binary_data"), // Encrypted JSON string of base64
		labels: text("labels"), // JSON string
		k8sUid: text("k8s_uid"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),

		autoCreated: boolean("is_auto_created").default(false).notNull(), // created by agent when it detects a configmap not in DB
	},
	(table) => ({
		clusterUidIdx: uniqueIndex("cm_cluster_uid_idx").on(
			table.clusterId,
			table.k8sUid,
		),
	}),
);

export const k8sSecrets = pgTable(
	"k8sSecrets",
	{
		id: serial("id").primaryKey(),
		clusterId: integer("cluster_id")
			.notNull()
			.references(() => k8sCluster.id, { onDelete: "cascade" }),
		ownerId: text("owner_id").references(() => profile.id, {
			onDelete: "set null",
		}),
		name: text("name").notNull(),
		namespace: text("namespace").notNull(),
		type: text("type"),
		data: text("data"), // Encrypted JSON string
		labels: text("labels"), // JSON string
		k8sUid: text("k8s_uid"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),

		autoCreated: boolean("is_auto_created").default(false).notNull(), // created by agent when it detects a secret not in DB
	},
	(table) => ({
		clusterUidIdx: uniqueIndex("sec_cluster_uid_idx").on(
			table.clusterId,
			table.k8sUid,
		),
	}),
);
export interface AppState {
	createNewAdmin: boolean;
}

export const AppState = pgTable("app_state", {
	id: serial("id").primaryKey(),

	state: jsonb("state").notNull().$type<AppState>().default({
		createNewAdmin: true,
	}),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});

export const gatewayPorts = pgTable("gateway_ports", {
	id: serial("id").primaryKey(),
	clusterId: integer("cluster_id")
		.notNull()
		.references(() => k8sCluster.id, { onDelete: "cascade" }),
	protocol: text("protocol").notNull(), // tcp | udp | http
	port: integer("port").notNull(),
	allocated: boolean("allocated").default(false).notNull(),
	serviceId: integer("service_id").references(() => k8sServices.id, {
		onDelete: "set null",
	}),
});

// ==================== Normalized Reference Tables ====================
// These tables replace the JSONB columns for ports, configMapRefs, and secretRefs

// Pod Ports
export const podPorts = pgTable("pod_ports", {
	id: serial("id").primaryKey(),
	podId: integer("pod_id")
		.notNull()
		.references(() => k8sPods.id, { onDelete: "cascade" }),
	containerPort: integer("container_port").notNull(),
	name: text("name"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Deployment Ports
export const deploymentPorts = pgTable("deployment_ports", {
	id: serial("id").primaryKey(),
	deploymentId: integer("deployment_id")
		.notNull()
		.references(() => k8sDeployments.id, { onDelete: "cascade" }),
	containerPort: integer("container_port").notNull(),
	name: text("name"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Pod ConfigMap References - Env
export const podConfigMapEnvRefs = pgTable("pod_configmap_env_refs", {
	id: serial("id").primaryKey(),
	podId: integer("pod_id")
		.notNull()
		.references(() => k8sPods.id, { onDelete: "cascade" }),
	envName: text("env_name").notNull(),
	configMapName: text("configmap_name").notNull(),
	configMapKey: text("configmap_key").notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Pod ConfigMap References - EnvFrom
export const podConfigMapEnvFromRefs = pgTable("pod_configmap_envfrom_refs", {
	id: serial("id").primaryKey(),
	podId: integer("pod_id")
		.notNull()
		.references(() => k8sPods.id, { onDelete: "cascade" }),
	configMapName: text("configmap_name").notNull(),
	prefix: text("prefix"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Pod ConfigMap References - Volume
export const podConfigMapVolumeRefs = pgTable("pod_configmap_volume_refs", {
	id: serial("id").primaryKey(),
	podId: integer("pod_id")
		.notNull()
		.references(() => k8sPods.id, { onDelete: "cascade" }),
	volumeName: text("volume_name").notNull(),
	configMapName: text("configmap_name").notNull(),
	mountPath: text("mount_path").notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Pod ConfigMap Volume Items
export const podConfigMapVolumeItems = pgTable("pod_configmap_volume_items", {
	id: serial("id").primaryKey(),
	volumeRefId: integer("volume_ref_id")
		.notNull()
		.references(() => podConfigMapVolumeRefs.id, { onDelete: "cascade" }),
	key: text("key").notNull(),
	path: text("path").notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Pod Secret References - Env
export const podSecretEnvRefs = pgTable("pod_secret_env_refs", {
	id: serial("id").primaryKey(),
	podId: integer("pod_id")
		.notNull()
		.references(() => k8sPods.id, { onDelete: "cascade" }),
	envName: text("env_name").notNull(),
	secretName: text("secret_name").notNull(),
	secretKey: text("secret_key").notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Pod Secret References - EnvFrom
export const podSecretEnvFromRefs = pgTable("pod_secret_envfrom_refs", {
	id: serial("id").primaryKey(),
	podId: integer("pod_id")
		.notNull()
		.references(() => k8sPods.id, { onDelete: "cascade" }),
	secretName: text("secret_name").notNull(),
	prefix: text("prefix"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Pod Secret References - Volume
export const podSecretVolumeRefs = pgTable("pod_secret_volume_refs", {
	id: serial("id").primaryKey(),
	podId: integer("pod_id")
		.notNull()
		.references(() => k8sPods.id, { onDelete: "cascade" }),
	volumeName: text("volume_name").notNull(),
	secretName: text("secret_name").notNull(),
	mountPath: text("mount_path").notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Pod Secret Volume Items
export const podSecretVolumeItems = pgTable("pod_secret_volume_items", {
	id: serial("id").primaryKey(),
	volumeRefId: integer("volume_ref_id")
		.notNull()
		.references(() => podSecretVolumeRefs.id, { onDelete: "cascade" }),
	key: text("key").notNull(),
	path: text("path").notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Deployment ConfigMap References - Env
export const deploymentConfigMapEnvRefs = pgTable(
	"deployment_configmap_env_refs",
	{
		id: serial("id").primaryKey(),
		deploymentId: integer("deployment_id")
			.notNull()
			.references(() => k8sDeployments.id, { onDelete: "cascade" }),
		envName: text("env_name").notNull(),
		configMapName: text("configmap_name").notNull(),
		configMapKey: text("configmap_key").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
);

// Deployment ConfigMap References - EnvFrom
export const deploymentConfigMapEnvFromRefs = pgTable(
	"deployment_configmap_envfrom_refs",
	{
		id: serial("id").primaryKey(),
		deploymentId: integer("deployment_id")
			.notNull()
			.references(() => k8sDeployments.id, { onDelete: "cascade" }),
		configMapName: text("configmap_name").notNull(),
		prefix: text("prefix"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
);

// Deployment ConfigMap References - Volume
export const deploymentConfigMapVolumeRefs = pgTable(
	"deployment_configmap_volume_refs",
	{
		id: serial("id").primaryKey(),
		deploymentId: integer("deployment_id")
			.notNull()
			.references(() => k8sDeployments.id, { onDelete: "cascade" }),
		volumeName: text("volume_name").notNull(),
		configMapName: text("configmap_name").notNull(),
		mountPath: text("mount_path").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
);

// Deployment ConfigMap Volume Items
export const deploymentConfigMapVolumeItems = pgTable(
	"deployment_configmap_volume_items",
	{
		id: serial("id").primaryKey(),
		volumeRefId: integer("volume_ref_id")
			.notNull()
			.references(() => deploymentConfigMapVolumeRefs.id, {
				onDelete: "cascade",
			}),
		key: text("key").notNull(),
		path: text("path").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
);

// Deployment Secret References - Env
export const deploymentSecretEnvRefs = pgTable("deployment_secret_env_refs", {
	id: serial("id").primaryKey(),
	deploymentId: integer("deployment_id")
		.notNull()
		.references(() => k8sDeployments.id, { onDelete: "cascade" }),
	envName: text("env_name").notNull(),
	secretName: text("secret_name").notNull(),
	secretKey: text("secret_key").notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Deployment Secret References - EnvFrom
export const deploymentSecretEnvFromRefs = pgTable(
	"deployment_secret_envfrom_refs",
	{
		id: serial("id").primaryKey(),
		deploymentId: integer("deployment_id")
			.notNull()
			.references(() => k8sDeployments.id, { onDelete: "cascade" }),
		secretName: text("secret_name").notNull(),
		prefix: text("prefix"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
);

// Deployment Secret References - Volume
export const deploymentSecretVolumeRefs = pgTable(
	"deployment_secret_volume_refs",
	{
		id: serial("id").primaryKey(),
		deploymentId: integer("deployment_id")
			.notNull()
			.references(() => k8sDeployments.id, { onDelete: "cascade" }),
		volumeName: text("volume_name").notNull(),
		secretName: text("secret_name").notNull(),
		mountPath: text("mount_path").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
);

// Deployment Secret Volume Items
export const deploymentSecretVolumeItems = pgTable(
	"deployment_secret_volume_items",
	{
		id: serial("id").primaryKey(),
		volumeRefId: integer("volume_ref_id")
			.notNull()
			.references(() => deploymentSecretVolumeRefs.id, { onDelete: "cascade" }),
		key: text("key").notNull(),
		path: text("path").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
);

// ==================== End of Normalized Reference Tables ====================

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
	// ... (skipping to relations block)
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
	// ...
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
}));
