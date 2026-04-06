import {
	boolean,
	integer,
	jsonb,
	pgTable,
	serial,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { profile } from "./auth";
import { k8sCluster, k8sClusterNode } from "./cluster";

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
		ports: jsonb("ports")
			.$type<{ data: any[] }>()
			.default({ data: [] })
			.notNull(), // Array of ServicePortDTO

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
		annotations: jsonb("annotations")
			.default({})
			.notNull()
			.$type<Record<string, string>>(), // JSON string
		templateAnnotations: jsonb("template_annotations")
			.default({})
			.notNull()
			.$type<Record<string, string>>(), // JSON string
		k8sUid: text("k8s_uid"),
		idleTimeoutSeconds: integer("idle_timeout_seconds").default(0).notNull(),
		lastAccessedAt: timestamp("last_accessed_at"),
		isAutoScaling: boolean("is_auto_scaling").default(false).notNull(),
		isAlwaysRunning: boolean("is_always_running").default(true).notNull(),
		resourceConfig: text("resource_config").default("").notNull(),

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
		nodeId: integer("node_id").references(() => k8sClusterNode.id, {
			onDelete: "cascade",
		}),
		ownerId: text("owner_id")
			.notNull()
			.references(() => profile.id, { onDelete: "cascade" }),

		name: text("name").notNull(),
		namespace: text("namespace").notNull(),
		dockerImage: text("docker_image").notNull(),
		cpuRequest: integer("cpu_request").notNull(),
		cpuLimit: integer("cpu_limit").notNull(),
		memoryRequest: integer("memory_request").notNull(),
		memoryLimit: integer("memory_limit").notNull(),
		command: text("command").notNull(),
		args: text("args").default("").notNull(),
		envVariables: text("env_variables").notNull(),
		labels: text("labels").default("").notNull(), // JSON string
		annotations: jsonb("annotations")
			.default({})
			.notNull()
			.$type<Record<string, string>>(), // JSON string

		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
		k8sUid: text("k8s_uid"),
		status: text("status").notNull().default("Unknown"),
		cpuUsage: integer("cpu_usage").default(0).notNull(),
		memoryUsage: integer("memory_usage").default(0).notNull(),
		resourceConfig: text("resource_config").default("").notNull(),
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
		annotations: jsonb("annotations")
			.default({})
			.notNull()
			.$type<Record<string, string>>(), // JSON string
		ports: jsonb("ports")
			.$type<{ data: any[] }>()
			.default({ data: [] })
			.notNull(), // Array of ServicePortDTO

		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
		k8sUid: text("k8s_uid"),
		status: text("status").notNull().default("Unknown"),
		resourceConfig: text("resource_config").default("").notNull(),

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
		serviceId: integer("service_id").references(() => k8sServices.id, {
			onDelete: "set null",
		}),
		ownerId: text("owner_id").references(() => profile.id, {
			onDelete: "set null",
		}),
		serviceName: text("service_name"),
		domain: text("domain"),
		port: integer("port"), // gateway port
		internalPort: integer("internal_port"), // service port
		protocol: text("protocol"), // http | tcp | udp
		path: text("path"),
		annotations: jsonb("annotations")
			.default({})
			.notNull()
			.$type<Record<string, string>>(), // JSON string
		labels: jsonb("labels")
			.default({})
			.notNull()
			.$type<Record<string, string>>(), // JSON string
		k8sUid: text("k8s_uid"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
		resourceConfig: text("resource_config").default("").notNull(),

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
		annotations: jsonb("annotations")
			.default({})
			.notNull()
			.$type<Record<string, string>>(), // JSON string
		k8sUid: text("k8s_uid"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
		resourceConfig: text("resource_config").default("").notNull(),

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
		annotations: jsonb("annotations")
			.default({})
			.notNull()
			.$type<Record<string, string>>(), // JSON string
		k8sUid: text("k8s_uid"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
		resourceConfig: text("resource_config").default("").notNull(),

		autoCreated: boolean("is_auto_created").default(false).notNull(), // created by agent when it detects a secret not in DB
	},
	(table) => ({
		clusterUidIdx: uniqueIndex("sec_cluster_uid_idx").on(
			table.clusterId,
			table.k8sUid,
		),
	}),
);

export const k8sPersistentVolumeClaims = pgTable(
	"k8sPersistentVolumeClaims",
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
		capacity: integer("capacity").notNull(), // in MiB
		phase: text("phase").notNull(),
		storageClass: text("storage_class"),
		volumeName: text("volume_name"),
		k8sUid: text("k8s_uid"),
		labels: jsonb("labels")
			.default({})
			.notNull()
			.$type<Record<string, string>>(),
		annotations: jsonb("annotations")
			.default({})
			.notNull()
			.$type<Record<string, string>>(),
		autoCreated: boolean("is_auto_created").default(false).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
		resourceConfig: text("resource_config").default("").notNull(),
	},
	(table) => ({
		clusterUidIdx: uniqueIndex("pvc_cluster_uid_idx").on(
			table.clusterId,
			table.k8sUid,
		),
	}),
);

export const k8sStorageClasses = pgTable(
	"k8sStorageClasses",
	{
		id: serial("id").primaryKey(),
		clusterId: integer("cluster_id")
			.notNull()
			.references(() => k8sCluster.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		provisioner: text("provisioner").notNull(),
		reclaimPolicy: text("reclaim_policy"),
		volumeBindingMode: text("volume_binding_mode"),
		allowVolumeExpansion: boolean("allow_volume_expansion")
			.default(false)
			.notNull(),
		annotations: jsonb("annotations")
			.default({})
			.notNull()
			.$type<Record<string, string>>(),
		labels: jsonb("labels")
			.default({})
			.notNull()
			.$type<Record<string, string>>(),
		isDefault: boolean("is_default").default(false).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
		resourceConfig: text("resource_config").default("").notNull(),
	},
	(table) => ({
		clusterNameIdx: uniqueIndex("sc_cluster_name_idx").on(
			table.clusterId,
			table.name,
		),
	}),
);

export const k8sPersistentVolumes = pgTable(
	"k8sPersistentVolumes",
	{
		id: serial("id").primaryKey(),
		clusterId: integer("cluster_id")
			.notNull()
			.references(() => k8sCluster.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		capacity: integer("capacity").notNull(), // in MiB
		phase: text("phase").notNull(),
		reclaimPolicy: text("reclaim_policy"),
		storageClass: text("storage_class"),
		boundPvc: text("bound_pvc"), // namespace/name of bound PVC
		accessModes: jsonb("access_modes")
			.$type<{ data: string[] }>()
			.default({ data: [] })
			.notNull(),
		annotations: jsonb("annotations")
			.default({})
			.notNull()
			.$type<Record<string, string>>(),
		labels: jsonb("labels")
			.default({})
			.notNull()
			.$type<Record<string, string>>(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
		resourceConfig: text("resource_config").default("").notNull(),
	},
	(table) => ({
		clusterNameIdx: uniqueIndex("pv_cluster_name_idx").on(
			table.clusterId,
			table.name,
		),
	}),
);
