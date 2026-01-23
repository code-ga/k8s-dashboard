// ALERT: user table only for auth, profile table for user data

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
import { defineRelations } from "drizzle-orm";

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
export const permissionEnum = pgEnum("permission", [
	"user",
	"manager",
	"default-account",
	"admin",
]);
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
	permission: permissionEnum().array().default(["user"]).notNull(),

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
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
		k8sUid: text("k8s_uid"),
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
		dockerImage: text("docker_image"),
		labels: text("labels"), // JSON string
		selector: text("selector"), // JSON string

		// Spec fields moved from k8sPods
		cpuRequest: integer("cpu_request").default(0).notNull(),
		cpuLimit: integer("cpu_limit").default(0).notNull(),
		memoryRequest: integer("memory_request").default(0).notNull(),
		memoryLimit: integer("memory_limit").default(0).notNull(),
		command: text("command").default("").notNull(),
		envVariables: text("env_variables").default("").notNull(),
		internalPort: integer("internal_port").default(0).notNull(),

		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
		k8sUid: text("k8s_uid"),
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
			.notNull()
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
		envVariables: text("env_variables").notNull(),

		internalPort: integer("internal_port").notNull(),

		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
		k8sUid: text("k8s_uid"),
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

		internalPort: integer("internal_port").notNull(),
		externalPort: integer("external_port").notNull(),
		domain: text("domain").notNull(),
		namespace: text("namespace").notNull(),
		labels: text("labels").notNull(),

		name: text("name").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
		k8sUid: text("k8s_uid"),
	},
	(table) => ({
		clusterUidIdx: uniqueIndex("svc_cluster_uid_idx").on(
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

// Restoration of missing relations and services table

export const schema = {
	user,
	session,
	account,
	verification,
	profile,
	k8sCluster,
	clusterAgent,
	k8sPods,
	k8sClusterNode,
	k8sServices,
	k8sDeployments,
	AppState,
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
	},
	clusterAgent: {
		cluster: r.one.k8sCluster({
			from: r.clusterAgent.id,
			to: r.k8sCluster.agentId,
		}),
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
	},
	profile: {
		user: r.one.user({
			from: r.profile.userId,
			to: r.user.id,
		}),
	},
	user: {
		profile: r.one.profile({
			from: r.user.id,
			to: r.profile.userId,
		}),
	},
}));
