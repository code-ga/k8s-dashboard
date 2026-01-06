import { relations } from "drizzle-orm";
import {
	boolean,
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

export const userRole = pgTable("userRole", {
	id: text("id").primaryKey(),
	userId: text("userId")
		.notNull()
		.references(() => user.id),
});

const clusterAgent = pgTable("clusterAgent", {
	id: serial("id").primaryKey(),
	token: text("token")
		.notNull()
		.unique()
		.$defaultFn(() => crypto.randomUUID()),
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
	enableS3Service: boolean("enable_s3_service").default(false).notNull(),
	s3AdminSecretKey: text("s3_admin_secret_key"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});

export const agentClusterRelation = relations(clusterAgent, ({ one }) => ({
	cluster: one(k8sCluster, {
		fields: [clusterAgent.id],
		references: [k8sCluster.agentId],
	}),
}));

export const schema = {
	user,
	session,
	account,
	verification,
	userRole,
	k8sCluster,
	clusterAgent,
} as const;
