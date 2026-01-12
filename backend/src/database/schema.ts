import { relations } from "drizzle-orm";
import {
	boolean,
	integer,
	pgEnum,
	pgTable,
	serial,
	text,
	timestamp,
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
const roleEnum = pgEnum("role", ["admin", "user"]);
export const userRole = pgTable("userRole", {
	id: serial("id").primaryKey(),
	userId: text("userId")
		.notNull()
		.references(() => user.id),
	role: roleEnum("role").notNull().default("user"),
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

const clusterStatus = pgEnum("cluster_status", ["active", "inactive"]);
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

	agentId: serial("agent_id")
		.notNull()
		.references(() => clusterAgent.id, { onDelete: "cascade" }),
	nodeId: integer("node_id")
		.notNull()
		.array()
		.references(() => clusterAgent.id, { onDelete: "cascade" }),

	enableS3Service: boolean("enable_s3_service").default(false).notNull(),
	s3AdminSecretKey: text("s3_admin_secret_key"),
	ramCapacity: integer("ram_capacity").notNull(),
	cpuCapacity: integer("cpu_capacity").notNull(),
	cpuUsage: integer("cpu_usage").notNull(),
	ramUsage: integer("ram_usage").notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});

export const k8sClusterNode = pgTable("k8sClusterNode", {
	id: serial("id").primaryKey(),
	clusterId: serial("cluster_id")
		.notNull()
		.references(() => k8sCluster.id, { onDelete: "cascade" }),
	name: text("name").notNull(),
	cpuUsage: integer("cpu_usage").notNull(),
	ramUsage: integer("ram_usage").notNull(),
	cpuCapacity: integer("cpu_capacity").notNull(),
	ramCapacity: integer("ram_capacity").notNull(),
	lable:text("lable").notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});


export const k8sDeployments = pgTable("k8sDeployments", {
	id: serial("id").primaryKey(),
	clusterId: serial("cluster_id")
		.notNull()
		.references(() => k8sCluster.id, { onDelete: "cascade" }),
	name: text("name").notNull(),
    namespace: text("namespace").notNull(),
	replicas: integer("replicas").notNull(),
    availableReplicas: integer("available_replicas").notNull(),
    unavailableReplicas: integer("unavailable_replicas").notNull(),
    dockerImage: text("docker_image"),
    labels: text("labels"), // JSON string
    selector: text("selector"), // JSON string

    // Spec fields moved from k8sPods
	cpuRequest:integer("cpu_request").default(0).notNull(),
	cpuLimit:integer("cpu_limit").default(0).notNull(),
	memoryRequest:integer("memory_request").default(0).notNull(),
	memoryLimit:integer("memory_limit").default(0).notNull(),
	command:text("command").default("").notNull(),
	envVariables:text("env_variables").default("").notNull(),
	internalPort:integer("internal_port").default(0).notNull(),

	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});

export const k8sDeploymentsClusterRelation = relations(k8sDeployments, ({ one, many }) => ({
	cluster: one(k8sCluster, {
		fields: [k8sDeployments.clusterId],
		references: [k8sCluster.id],
	}),
    pods: many(k8sPods),
}));

export const k8sPods = pgTable("k8sPods", {
	id: serial("id").primaryKey(),
	clusterId: serial("cluster_id")
		.notNull()
		.references(() => k8sCluster.id, { onDelete: "cascade" }),
    deploymentId: serial("deployment_id")
		.references(() => k8sDeployments.id, { onDelete: "set null" }), // Pods can exist without deployment (bare pods)
	nodeId: serial("node_id") // Can be null if pending? Schema says serial (autoincrement) which implies NOT NULL usually in Drizzle unless specified. 
        // Existing schema had it as serial and references k8sClusterNode.
		.notNull()
		.references(() => k8sClusterNode.id, { onDelete: "cascade" }),
	name: text("name").notNull(),
	namespace: text("namespace").notNull(),
	dockerImage:text("docker_image").notNull(),
	// replicas removed
	cpuRequest:integer("cpu_request").notNull(),
	cpuLimit:integer("cpu_limit").notNull(),
	memoryRequest:integer("memory_request").notNull(),
	memoryLimit:integer("memory_limit").notNull(),
    // Keep these on pod for actual usage/status? Or remove if we only care about spec on Deployment?
    // User asked to reconstruct "like k8s architecture". K8s Pods have specs. 
    // But specifically "only deployment have the replicas".
    // I will keep resource specs on Pods as they reflect the actual pod spec (which might differ during updates).
	command:text("command").notNull(),
	envVariables:text("env_variables").notNull(),

	inernalPort:integer("inernal_port").notNull(),

	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});

// Restoration of missing relations and services table

export const k8sPodsNodeRelation = relations(k8sPods, ({ one }) => ({
	node: one(k8sClusterNode, {
		fields: [k8sPods.nodeId],
		references: [k8sClusterNode.id],
	}),
}));

export const k8sPodsClusterRelation = relations(k8sPods, ({ one }) => ({
	cluster: one(k8sCluster, {
		fields: [k8sPods.clusterId],
		references: [k8sCluster.id],
	}),
    deployment: one(k8sDeployments, {
        fields: [k8sPods.deploymentId],
        references: [k8sDeployments.id],
    }),
}));

export const k8sServices = pgTable("k8sServices", {
	id: serial("id").primaryKey(),
	clusterId: serial("cluster_id")
		.notNull()
		.references(() => k8sCluster.id, { onDelete: "cascade" }),
	nodeId: serial("node_id")
		.notNull()
		.references(() => k8sClusterNode.id, { onDelete: "cascade" }),
	podId: serial("pod_id")
		.notNull()
		.references(() => k8sPods.id, { onDelete: "cascade" }),

	internalPort:integer("internal_port").notNull(),
	externalPort:integer("external_port").notNull(),
	domain:text("domain").notNull(),
	namespace: text("namespace").notNull(),
	lable:text("lable").notNull(),

	name: text("name").notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});

export const k8sServicesNodeRelation = relations(k8sServices, ({ one }) => ({
	node: one(k8sClusterNode, {
		fields: [k8sServices.nodeId],
		references: [k8sClusterNode.id],
	}),
}));

export const k8sServicesClusterRelation = relations(k8sServices, ({ one }) => ({
	cluster: one(k8sCluster, {
		fields: [k8sServices.clusterId],
		references: [k8sCluster.id],
	}),
}));

export const k8sServicesPodRelation = relations(k8sServices, ({ one }) => ({
	pod: one(k8sPods, {
		fields: [k8sServices.podId],
		references: [k8sPods.id],
	}),
}));

export const clusterK8sClusterRelation = relations(k8sCluster, ({ one }) => ({
	agent: one(clusterAgent, {
		fields: [k8sCluster.agentId],
		references: [clusterAgent.id],
	}),
}));

export const agentClusterRelation = relations(clusterAgent, ({ one }) => ({
	cluster: one(k8sCluster, {
		fields: [clusterAgent.id],
		references: [k8sCluster.agentId],
	}),
}));

export const k8sClusterRelations = relations(k8sCluster, ({ many, one }) => ({
	nodes: many(k8sClusterNode),
    deployments: many(k8sDeployments),
    services: many(k8sServices),
    agent: one(clusterAgent, {
        fields: [k8sCluster.agentId],
        references: [clusterAgent.id],
    }),
}));

export const k8sClusterNodeRelations = relations(k8sClusterNode, ({ one, many }) => ({
    cluster: one(k8sCluster, {
        fields: [k8sClusterNode.clusterId],
        references: [k8sCluster.id],
    }),
    pods: many(k8sPods),
    services: many(k8sServices),
}));

export const schema = {
	user,
	session,
	account,
	verification,
	userRole,
	k8sCluster,
	clusterAgent,
	k8sPods,
	k8sClusterNode,
	k8sServices,
    k8sDeployments,
} as const;
