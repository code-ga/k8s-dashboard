CREATE TYPE "agent_command_status" AS ENUM('pending', 'sent', 'success', 'failed', 'timeout');--> statement-breakpoint
CREATE TYPE "cluster_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "permission" AS ENUM('user', 'manager', 'default-account', 'admin');--> statement-breakpoint
CREATE TABLE "app_state" (
	"id" serial PRIMARY KEY,
	"state" jsonb DEFAULT '{"createNewAdmin":true}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agentCommands" (
	"id" text PRIMARY KEY,
	"agent_id" integer NOT NULL,
	"cluster_id" integer NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "agent_command_status" DEFAULT 'pending'::"agent_command_status" NOT NULL,
	"result" jsonb,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clusterAgent" (
	"id" serial PRIMARY KEY,
	"token" text NOT NULL UNIQUE,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deployment_configmap_envfrom_refs" (
	"id" serial PRIMARY KEY,
	"deployment_id" integer NOT NULL,
	"configmap_name" text NOT NULL,
	"prefix" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deployment_configmap_env_refs" (
	"id" serial PRIMARY KEY,
	"deployment_id" integer NOT NULL,
	"env_name" text NOT NULL,
	"configmap_name" text NOT NULL,
	"configmap_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deployment_configmap_volume_items" (
	"id" serial PRIMARY KEY,
	"volume_ref_id" integer NOT NULL,
	"key" text NOT NULL,
	"path" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deployment_configmap_volume_refs" (
	"id" serial PRIMARY KEY,
	"deployment_id" integer NOT NULL,
	"volume_name" text NOT NULL,
	"configmap_name" text NOT NULL,
	"mount_path" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deployment_ports" (
	"id" serial PRIMARY KEY,
	"deployment_id" integer NOT NULL,
	"container_port" integer NOT NULL,
	"name" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deployment_secret_envfrom_refs" (
	"id" serial PRIMARY KEY,
	"deployment_id" integer NOT NULL,
	"secret_name" text NOT NULL,
	"prefix" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deployment_secret_env_refs" (
	"id" serial PRIMARY KEY,
	"deployment_id" integer NOT NULL,
	"env_name" text NOT NULL,
	"secret_name" text NOT NULL,
	"secret_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deployment_secret_volume_items" (
	"id" serial PRIMARY KEY,
	"volume_ref_id" integer NOT NULL,
	"key" text NOT NULL,
	"path" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deployment_secret_volume_refs" (
	"id" serial PRIMARY KEY,
	"deployment_id" integer NOT NULL,
	"volume_name" text NOT NULL,
	"secret_name" text NOT NULL,
	"mount_path" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gateway_ports" (
	"id" serial PRIMARY KEY,
	"cluster_id" integer NOT NULL,
	"protocol" text NOT NULL,
	"port" integer NOT NULL,
	"allocated" boolean DEFAULT false NOT NULL,
	"service_id" integer
);
--> statement-breakpoint
CREATE TABLE "k8sCluster" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"description" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"cluster_domain" text NOT NULL,
	"status" "cluster_status" DEFAULT 'inactive'::"cluster_status" NOT NULL,
	"agent_id" integer NOT NULL,
	"node_id" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"enable_s3_service" boolean DEFAULT false NOT NULL,
	"s3_admin_secret_key" text,
	"ram_capacity" integer DEFAULT 1000000000 NOT NULL,
	"cpu_capacity" integer DEFAULT 1000000000 NOT NULL,
	"cpu_usage" integer DEFAULT 0 NOT NULL,
	"ram_usage" integer DEFAULT 0 NOT NULL,
	"internal_cluster_domain" text DEFAULT 'cluster.local' NOT NULL,
	"acme_email" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "k8sClusterNode" (
	"id" serial PRIMARY KEY,
	"cluster_id" integer NOT NULL,
	"name" text NOT NULL,
	"cpu_usage" integer NOT NULL,
	"ram_usage" integer NOT NULL,
	"cpu_capacity" integer NOT NULL,
	"ram_capacity" integer NOT NULL,
	"labels" text NOT NULL,
	"status" text DEFAULT 'Unknown' NOT NULL,
	"roles" text[] DEFAULT '{}'::text[] NOT NULL,
	"public_ip" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"k8s_uid" text,
	"auto_created" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "k8sConfigMaps" (
	"id" serial PRIMARY KEY,
	"cluster_id" integer NOT NULL,
	"owner_id" text,
	"name" text NOT NULL,
	"namespace" text NOT NULL,
	"data" text,
	"binary_data" text,
	"labels" text,
	"k8s_uid" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"is_auto_created" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "k8sDeployments" (
	"id" serial PRIMARY KEY,
	"cluster_id" integer NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"namespace" text NOT NULL,
	"replicas" integer NOT NULL,
	"available_replicas" integer NOT NULL,
	"unavailable_replicas" integer NOT NULL,
	"docker_image" text NOT NULL,
	"labels" text,
	"selector" text,
	"cpu_request" integer DEFAULT 0 NOT NULL,
	"cpu_limit" integer DEFAULT 0 NOT NULL,
	"memory_request" integer DEFAULT 0 NOT NULL,
	"memory_limit" integer DEFAULT 0 NOT NULL,
	"command" text DEFAULT '' NOT NULL,
	"args" text DEFAULT '' NOT NULL,
	"env_variables" text DEFAULT '' NOT NULL,
	"ports" jsonb DEFAULT '[]' NOT NULL,
	"configmap_refs" jsonb DEFAULT '{"env":[],"envFrom":[],"volumes":[]}',
	"secret_refs" jsonb DEFAULT '{"env":[],"envFrom":[],"volumes":[]}',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"k8s_uid" text,
	"idle_timeout_seconds" integer DEFAULT 0 NOT NULL,
	"last_accessed_at" timestamp,
	"is_auto_scaling" boolean DEFAULT false NOT NULL,
	"is_always_running" boolean DEFAULT false NOT NULL,
	"is_auto_created" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "k8sIngresses" (
	"id" serial PRIMARY KEY,
	"cluster_id" integer NOT NULL,
	"name" text NOT NULL,
	"namespace" text NOT NULL,
	"service_id" integer NOT NULL,
	"service_name" text,
	"domain" text,
	"port" integer,
	"protocol" text,
	"path" text,
	"k8s_uid" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"is_auto_created" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "k8sPods" (
	"id" serial PRIMARY KEY,
	"cluster_id" integer NOT NULL,
	"deployment_id" integer,
	"node_id" integer,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"namespace" text NOT NULL,
	"docker_image" text NOT NULL,
	"cpu_request" integer NOT NULL,
	"cpu_limit" integer NOT NULL,
	"memory_request" integer NOT NULL,
	"memory_limit" integer NOT NULL,
	"command" text NOT NULL,
	"args" text DEFAULT '' NOT NULL,
	"env_variables" text NOT NULL,
	"labels" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"k8s_uid" text,
	"status" text DEFAULT 'Unknown' NOT NULL,
	"cpu_usage" integer DEFAULT 0 NOT NULL,
	"memory_usage" integer DEFAULT 0 NOT NULL,
	"is_auto_created" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "k8sSecrets" (
	"id" serial PRIMARY KEY,
	"cluster_id" integer NOT NULL,
	"owner_id" text,
	"name" text NOT NULL,
	"namespace" text NOT NULL,
	"type" text,
	"data" text,
	"labels" text,
	"k8s_uid" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"is_auto_created" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "k8sServices" (
	"id" serial PRIMARY KEY,
	"cluster_id" integer NOT NULL,
	"node_id" integer,
	"pod_id" integer,
	"owner_id" text,
	"name" text NOT NULL,
	"namespace" text NOT NULL,
	"type" text,
	"cluster_ip" text,
	"selector" text,
	"labels" text NOT NULL,
	"ports" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"k8s_uid" text,
	"status" text DEFAULT 'Unknown' NOT NULL,
	"is_auto_created" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pod_configmap_envfrom_refs" (
	"id" serial PRIMARY KEY,
	"pod_id" integer NOT NULL,
	"configmap_name" text NOT NULL,
	"prefix" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pod_configmap_env_refs" (
	"id" serial PRIMARY KEY,
	"pod_id" integer NOT NULL,
	"env_name" text NOT NULL,
	"configmap_name" text NOT NULL,
	"configmap_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pod_configmap_volume_items" (
	"id" serial PRIMARY KEY,
	"volume_ref_id" integer NOT NULL,
	"key" text NOT NULL,
	"path" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pod_configmap_volume_refs" (
	"id" serial PRIMARY KEY,
	"pod_id" integer NOT NULL,
	"volume_name" text NOT NULL,
	"configmap_name" text NOT NULL,
	"mount_path" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pod_ports" (
	"id" serial PRIMARY KEY,
	"pod_id" integer NOT NULL,
	"container_port" integer NOT NULL,
	"name" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pod_secret_envfrom_refs" (
	"id" serial PRIMARY KEY,
	"pod_id" integer NOT NULL,
	"secret_name" text NOT NULL,
	"prefix" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pod_secret_env_refs" (
	"id" serial PRIMARY KEY,
	"pod_id" integer NOT NULL,
	"env_name" text NOT NULL,
	"secret_name" text NOT NULL,
	"secret_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pod_secret_volume_items" (
	"id" serial PRIMARY KEY,
	"volume_ref_id" integer NOT NULL,
	"key" text NOT NULL,
	"path" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pod_secret_volume_refs" (
	"id" serial PRIMARY KEY,
	"pod_id" integer NOT NULL,
	"volume_name" text NOT NULL,
	"secret_name" text NOT NULL,
	"mount_path" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL UNIQUE,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"username" text NOT NULL,
	"permission" "permission"[] DEFAULT '{user}'::"permission"[] NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL UNIQUE,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "node_cluster_uid_idx" ON "k8sClusterNode" ("cluster_id","k8s_uid");--> statement-breakpoint
CREATE UNIQUE INDEX "cm_cluster_uid_idx" ON "k8sConfigMaps" ("cluster_id","k8s_uid");--> statement-breakpoint
CREATE UNIQUE INDEX "dep_cluster_uid_idx" ON "k8sDeployments" ("cluster_id","k8s_uid");--> statement-breakpoint
CREATE UNIQUE INDEX "ing_cluster_uid_idx" ON "k8sIngresses" ("cluster_id","k8s_uid");--> statement-breakpoint
CREATE UNIQUE INDEX "pod_cluster_uid_idx" ON "k8sPods" ("cluster_id","k8s_uid");--> statement-breakpoint
CREATE UNIQUE INDEX "sec_cluster_uid_idx" ON "k8sSecrets" ("cluster_id","k8s_uid");--> statement-breakpoint
CREATE UNIQUE INDEX "svc_cluster_uid_idx" ON "k8sServices" ("cluster_id","k8s_uid");--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "agentCommands" ADD CONSTRAINT "agentCommands_agent_id_clusterAgent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "clusterAgent"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "agentCommands" ADD CONSTRAINT "agentCommands_cluster_id_k8sCluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "k8sCluster"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "deployment_configmap_envfrom_refs" ADD CONSTRAINT "deployment_configmap_envfrom_refs_2XzadbxTd6HE_fkey" FOREIGN KEY ("deployment_id") REFERENCES "k8sDeployments"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "deployment_configmap_env_refs" ADD CONSTRAINT "deployment_configmap_env_refs_GxxduREdTio2_fkey" FOREIGN KEY ("deployment_id") REFERENCES "k8sDeployments"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "deployment_configmap_volume_items" ADD CONSTRAINT "deployment_configmap_volume_items_R7p0SBomVYjE_fkey" FOREIGN KEY ("volume_ref_id") REFERENCES "deployment_configmap_volume_refs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "deployment_configmap_volume_refs" ADD CONSTRAINT "deployment_configmap_volume_refs_7YMbjlO22s4N_fkey" FOREIGN KEY ("deployment_id") REFERENCES "k8sDeployments"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "deployment_ports" ADD CONSTRAINT "deployment_ports_deployment_id_k8sDeployments_id_fkey" FOREIGN KEY ("deployment_id") REFERENCES "k8sDeployments"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "deployment_secret_envfrom_refs" ADD CONSTRAINT "deployment_secret_envfrom_refs_J2RFMQI5TwtC_fkey" FOREIGN KEY ("deployment_id") REFERENCES "k8sDeployments"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "deployment_secret_env_refs" ADD CONSTRAINT "deployment_secret_env_refs_deployment_id_k8sDeployments_id_fkey" FOREIGN KEY ("deployment_id") REFERENCES "k8sDeployments"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "deployment_secret_volume_items" ADD CONSTRAINT "deployment_secret_volume_items_8nT374cDzZbE_fkey" FOREIGN KEY ("volume_ref_id") REFERENCES "deployment_secret_volume_refs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "deployment_secret_volume_refs" ADD CONSTRAINT "deployment_secret_volume_refs_HHpTrFqOELcP_fkey" FOREIGN KEY ("deployment_id") REFERENCES "k8sDeployments"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "gateway_ports" ADD CONSTRAINT "gateway_ports_cluster_id_k8sCluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "k8sCluster"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "gateway_ports" ADD CONSTRAINT "gateway_ports_service_id_k8sServices_id_fkey" FOREIGN KEY ("service_id") REFERENCES "k8sServices"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "k8sCluster" ADD CONSTRAINT "k8sCluster_agent_id_clusterAgent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "clusterAgent"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "k8sClusterNode" ADD CONSTRAINT "k8sClusterNode_cluster_id_k8sCluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "k8sCluster"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "k8sConfigMaps" ADD CONSTRAINT "k8sConfigMaps_cluster_id_k8sCluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "k8sCluster"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "k8sConfigMaps" ADD CONSTRAINT "k8sConfigMaps_owner_id_profile_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "profile"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "k8sDeployments" ADD CONSTRAINT "k8sDeployments_cluster_id_k8sCluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "k8sCluster"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "k8sDeployments" ADD CONSTRAINT "k8sDeployments_owner_id_profile_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "profile"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "k8sIngresses" ADD CONSTRAINT "k8sIngresses_cluster_id_k8sCluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "k8sCluster"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "k8sIngresses" ADD CONSTRAINT "k8sIngresses_service_id_k8sServices_id_fkey" FOREIGN KEY ("service_id") REFERENCES "k8sServices"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "k8sPods" ADD CONSTRAINT "k8sPods_cluster_id_k8sCluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "k8sCluster"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "k8sPods" ADD CONSTRAINT "k8sPods_deployment_id_k8sDeployments_id_fkey" FOREIGN KEY ("deployment_id") REFERENCES "k8sDeployments"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "k8sPods" ADD CONSTRAINT "k8sPods_node_id_k8sClusterNode_id_fkey" FOREIGN KEY ("node_id") REFERENCES "k8sClusterNode"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "k8sPods" ADD CONSTRAINT "k8sPods_owner_id_profile_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "profile"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "k8sSecrets" ADD CONSTRAINT "k8sSecrets_cluster_id_k8sCluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "k8sCluster"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "k8sSecrets" ADD CONSTRAINT "k8sSecrets_owner_id_profile_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "profile"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "k8sServices" ADD CONSTRAINT "k8sServices_cluster_id_k8sCluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "k8sCluster"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "k8sServices" ADD CONSTRAINT "k8sServices_node_id_k8sClusterNode_id_fkey" FOREIGN KEY ("node_id") REFERENCES "k8sClusterNode"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "k8sServices" ADD CONSTRAINT "k8sServices_pod_id_k8sPods_id_fkey" FOREIGN KEY ("pod_id") REFERENCES "k8sPods"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "k8sServices" ADD CONSTRAINT "k8sServices_owner_id_profile_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "profile"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "pod_configmap_envfrom_refs" ADD CONSTRAINT "pod_configmap_envfrom_refs_pod_id_k8sPods_id_fkey" FOREIGN KEY ("pod_id") REFERENCES "k8sPods"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "pod_configmap_env_refs" ADD CONSTRAINT "pod_configmap_env_refs_pod_id_k8sPods_id_fkey" FOREIGN KEY ("pod_id") REFERENCES "k8sPods"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "pod_configmap_volume_items" ADD CONSTRAINT "pod_configmap_volume_items_WTvG8LX1i0D4_fkey" FOREIGN KEY ("volume_ref_id") REFERENCES "pod_configmap_volume_refs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "pod_configmap_volume_refs" ADD CONSTRAINT "pod_configmap_volume_refs_pod_id_k8sPods_id_fkey" FOREIGN KEY ("pod_id") REFERENCES "k8sPods"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "pod_ports" ADD CONSTRAINT "pod_ports_pod_id_k8sPods_id_fkey" FOREIGN KEY ("pod_id") REFERENCES "k8sPods"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "pod_secret_envfrom_refs" ADD CONSTRAINT "pod_secret_envfrom_refs_pod_id_k8sPods_id_fkey" FOREIGN KEY ("pod_id") REFERENCES "k8sPods"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "pod_secret_env_refs" ADD CONSTRAINT "pod_secret_env_refs_pod_id_k8sPods_id_fkey" FOREIGN KEY ("pod_id") REFERENCES "k8sPods"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "pod_secret_volume_items" ADD CONSTRAINT "pod_secret_volume_items_O8bchhLqNzhU_fkey" FOREIGN KEY ("volume_ref_id") REFERENCES "pod_secret_volume_refs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "pod_secret_volume_refs" ADD CONSTRAINT "pod_secret_volume_refs_pod_id_k8sPods_id_fkey" FOREIGN KEY ("pod_id") REFERENCES "k8sPods"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;