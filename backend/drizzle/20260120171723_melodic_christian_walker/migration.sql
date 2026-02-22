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
CREATE TABLE "clusterAgent" (
	"id" serial PRIMARY KEY,
	"token" text NOT NULL UNIQUE,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
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
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"k8s_uid" text
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
	"docker_image" text,
	"labels" text,
	"selector" text,
	"cpu_request" integer DEFAULT 0 NOT NULL,
	"cpu_limit" integer DEFAULT 0 NOT NULL,
	"memory_request" integer DEFAULT 0 NOT NULL,
	"memory_limit" integer DEFAULT 0 NOT NULL,
	"command" text DEFAULT '' NOT NULL,
	"env_variables" text DEFAULT '' NOT NULL,
	"internal_port" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"k8s_uid" text
);
--> statement-breakpoint
CREATE TABLE "k8sPods" (
	"id" serial PRIMARY KEY,
	"cluster_id" integer NOT NULL,
	"deployment_id" integer,
	"node_id" integer NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"namespace" text NOT NULL,
	"docker_image" text NOT NULL,
	"cpu_request" integer NOT NULL,
	"cpu_limit" integer NOT NULL,
	"memory_request" integer NOT NULL,
	"memory_limit" integer NOT NULL,
	"command" text NOT NULL,
	"env_variables" text NOT NULL,
	"internal_port" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"k8s_uid" text
);
--> statement-breakpoint
CREATE TABLE "k8sServices" (
	"id" serial PRIMARY KEY,
	"cluster_id" integer NOT NULL,
	"node_id" integer,
	"pod_id" integer,
	"internal_port" integer NOT NULL,
	"external_port" integer NOT NULL,
	"domain" text NOT NULL,
	"namespace" text NOT NULL,
	"labels" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"k8s_uid" text
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
CREATE UNIQUE INDEX "dep_cluster_uid_idx" ON "k8sDeployments" ("cluster_id","k8s_uid");--> statement-breakpoint
CREATE UNIQUE INDEX "pod_cluster_uid_idx" ON "k8sPods" ("cluster_id","k8s_uid");--> statement-breakpoint
CREATE UNIQUE INDEX "svc_cluster_uid_idx" ON "k8sServices" ("cluster_id","k8s_uid");--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "k8sCluster" ADD CONSTRAINT "k8sCluster_agent_id_clusterAgent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "clusterAgent"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "k8sClusterNode" ADD CONSTRAINT "k8sClusterNode_cluster_id_k8sCluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "k8sCluster"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "k8sDeployments" ADD CONSTRAINT "k8sDeployments_cluster_id_k8sCluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "k8sCluster"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "k8sDeployments" ADD CONSTRAINT "k8sDeployments_owner_id_profile_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "profile"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "k8sPods" ADD CONSTRAINT "k8sPods_cluster_id_k8sCluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "k8sCluster"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "k8sPods" ADD CONSTRAINT "k8sPods_deployment_id_k8sDeployments_id_fkey" FOREIGN KEY ("deployment_id") REFERENCES "k8sDeployments"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "k8sPods" ADD CONSTRAINT "k8sPods_node_id_k8sClusterNode_id_fkey" FOREIGN KEY ("node_id") REFERENCES "k8sClusterNode"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "k8sPods" ADD CONSTRAINT "k8sPods_owner_id_profile_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "profile"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "k8sServices" ADD CONSTRAINT "k8sServices_cluster_id_k8sCluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "k8sCluster"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "k8sServices" ADD CONSTRAINT "k8sServices_node_id_k8sClusterNode_id_fkey" FOREIGN KEY ("node_id") REFERENCES "k8sClusterNode"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "k8sServices" ADD CONSTRAINT "k8sServices_pod_id_k8sPods_id_fkey" FOREIGN KEY ("pod_id") REFERENCES "k8sPods"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;