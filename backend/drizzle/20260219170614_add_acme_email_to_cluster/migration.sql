ALTER TABLE "k8sCluster" ADD COLUMN "acme_email" text;--> statement-breakpoint
ALTER TABLE "k8sServices" ADD COLUMN "ports" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "k8sPods" DROP COLUMN "ports";--> statement-breakpoint
ALTER TABLE "k8sPods" DROP COLUMN "configmap_refs";--> statement-breakpoint
ALTER TABLE "k8sPods" DROP COLUMN "secret_refs";