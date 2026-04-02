import {
	boolean,
	integer,
	pgTable,
	serial,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { pgEnum } from "drizzle-orm/pg-core";

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
	clusterDomain: text("cluster_domain").notNull(),
	status: clusterStatus("status").notNull().default("inactive"),

	agentId: integer("agent_id")
		.notNull()
		.references(() => clusterAgent.id, { onDelete: "cascade" }),
	nodeIds: integer("node_id").notNull().array().default([]),

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
		annotations: jsonb("annotations")
			.default({})
			.notNull()
			.$type<Record<string, string>>(), // JSON string
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

import { jsonb } from "drizzle-orm/pg-core";
