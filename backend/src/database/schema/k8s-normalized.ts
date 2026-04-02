import {
	integer,
	pgTable,
	serial,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { k8sDeployments, k8sPods } from "./k8s-resources";

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
