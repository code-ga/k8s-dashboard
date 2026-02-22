CREATE TYPE "agent_command_status" AS ENUM('pending', 'sent', 'success', 'failed', 'timeout');--> statement-breakpoint
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
ALTER TABLE "k8sCluster" ADD COLUMN "internal_cluster_domain" text DEFAULT 'cluster.local' NOT NULL;--> statement-breakpoint
ALTER TABLE "k8sClusterNode" ADD COLUMN "status" text DEFAULT 'Unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "k8sClusterNode" ADD COLUMN "roles" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "k8sClusterNode" ADD COLUMN "public_ip" text;--> statement-breakpoint
ALTER TABLE "k8sClusterNode" ADD COLUMN "auto_created" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "k8sDeployments" ADD COLUMN "args" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "k8sDeployments" ADD COLUMN "ports" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "k8sDeployments" ADD COLUMN "configmap_refs" jsonb DEFAULT '{"env":[],"envFrom":[],"volumes":[]}';--> statement-breakpoint
ALTER TABLE "k8sDeployments" ADD COLUMN "secret_refs" jsonb DEFAULT '{"env":[],"envFrom":[],"volumes":[]}';--> statement-breakpoint
ALTER TABLE "k8sDeployments" ADD COLUMN "idle_timeout_seconds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "k8sDeployments" ADD COLUMN "last_accessed_at" timestamp;--> statement-breakpoint
ALTER TABLE "k8sDeployments" ADD COLUMN "is_auto_scaling" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "k8sDeployments" ADD COLUMN "is_always_running" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "k8sDeployments" ADD COLUMN "is_auto_created" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "k8sPods" ADD COLUMN "args" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "k8sPods" ADD COLUMN "labels" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "k8sPods" ADD COLUMN "ports" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "k8sPods" ADD COLUMN "configmap_refs" jsonb DEFAULT '{"env":[],"envFrom":[],"volumes":[]}';--> statement-breakpoint
ALTER TABLE "k8sPods" ADD COLUMN "secret_refs" jsonb DEFAULT '{"env":[],"envFrom":[],"volumes":[]}';--> statement-breakpoint
ALTER TABLE "k8sPods" ADD COLUMN "status" text DEFAULT 'Unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "k8sPods" ADD COLUMN "cpu_usage" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "k8sPods" ADD COLUMN "memory_usage" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "k8sPods" ADD COLUMN "is_auto_created" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "k8sServices" ADD COLUMN "owner_id" text;--> statement-breakpoint
ALTER TABLE "k8sServices" ADD COLUMN "type" text;--> statement-breakpoint
ALTER TABLE "k8sServices" ADD COLUMN "cluster_ip" text;--> statement-breakpoint
ALTER TABLE "k8sServices" ADD COLUMN "selector" text;--> statement-breakpoint
ALTER TABLE "k8sServices" ADD COLUMN "status" text DEFAULT 'Unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "k8sServices" ADD COLUMN "is_auto_created" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "k8sDeployments" DROP COLUMN "internal_port";--> statement-breakpoint
ALTER TABLE "k8sPods" DROP COLUMN "internal_port";--> statement-breakpoint
ALTER TABLE "k8sServices" DROP COLUMN "internal_port";--> statement-breakpoint
ALTER TABLE "k8sServices" DROP COLUMN "external_port";--> statement-breakpoint
ALTER TABLE "k8sServices" DROP COLUMN "domain";--> statement-breakpoint
ALTER TABLE "k8sDeployments" ALTER COLUMN "docker_image" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "k8sPods" ALTER COLUMN "node_id" DROP NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "cm_cluster_uid_idx" ON "k8sConfigMaps" ("cluster_id","k8s_uid");--> statement-breakpoint
CREATE UNIQUE INDEX "ing_cluster_uid_idx" ON "k8sIngresses" ("cluster_id","k8s_uid");--> statement-breakpoint
CREATE UNIQUE INDEX "sec_cluster_uid_idx" ON "k8sSecrets" ("cluster_id","k8s_uid");--> statement-breakpoint
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
ALTER TABLE "k8sConfigMaps" ADD CONSTRAINT "k8sConfigMaps_cluster_id_k8sCluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "k8sCluster"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "k8sConfigMaps" ADD CONSTRAINT "k8sConfigMaps_owner_id_profile_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "profile"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "k8sIngresses" ADD CONSTRAINT "k8sIngresses_cluster_id_k8sCluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "k8sCluster"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "k8sIngresses" ADD CONSTRAINT "k8sIngresses_service_id_k8sServices_id_fkey" FOREIGN KEY ("service_id") REFERENCES "k8sServices"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "k8sSecrets" ADD CONSTRAINT "k8sSecrets_cluster_id_k8sCluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "k8sCluster"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "k8sSecrets" ADD CONSTRAINT "k8sSecrets_owner_id_profile_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "profile"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "k8sServices" ADD CONSTRAINT "k8sServices_owner_id_profile_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "profile"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "pod_configmap_envfrom_refs" ADD CONSTRAINT "pod_configmap_envfrom_refs_pod_id_k8sPods_id_fkey" FOREIGN KEY ("pod_id") REFERENCES "k8sPods"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "pod_configmap_env_refs" ADD CONSTRAINT "pod_configmap_env_refs_pod_id_k8sPods_id_fkey" FOREIGN KEY ("pod_id") REFERENCES "k8sPods"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "pod_configmap_volume_items" ADD CONSTRAINT "pod_configmap_volume_items_WTvG8LX1i0D4_fkey" FOREIGN KEY ("volume_ref_id") REFERENCES "pod_configmap_volume_refs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "pod_configmap_volume_refs" ADD CONSTRAINT "pod_configmap_volume_refs_pod_id_k8sPods_id_fkey" FOREIGN KEY ("pod_id") REFERENCES "k8sPods"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "pod_ports" ADD CONSTRAINT "pod_ports_pod_id_k8sPods_id_fkey" FOREIGN KEY ("pod_id") REFERENCES "k8sPods"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "pod_secret_envfrom_refs" ADD CONSTRAINT "pod_secret_envfrom_refs_pod_id_k8sPods_id_fkey" FOREIGN KEY ("pod_id") REFERENCES "k8sPods"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "pod_secret_env_refs" ADD CONSTRAINT "pod_secret_env_refs_pod_id_k8sPods_id_fkey" FOREIGN KEY ("pod_id") REFERENCES "k8sPods"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "pod_secret_volume_items" ADD CONSTRAINT "pod_secret_volume_items_O8bchhLqNzhU_fkey" FOREIGN KEY ("volume_ref_id") REFERENCES "pod_secret_volume_refs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "pod_secret_volume_refs" ADD CONSTRAINT "pod_secret_volume_refs_pod_id_k8sPods_id_fkey" FOREIGN KEY ("pod_id") REFERENCES "k8sPods"("id") ON DELETE CASCADE;