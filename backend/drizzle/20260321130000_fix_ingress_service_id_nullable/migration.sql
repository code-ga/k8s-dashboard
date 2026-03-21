-- Fix: k8sIngresses.service_id had NOT NULL constraint but the FK uses ON DELETE SET NULL.
-- These are mutually exclusive — PostgreSQL cannot SET NULL on a NOT NULL column.
-- This migration drops the NOT NULL constraint to make the column nullable,
-- consistent with the ON DELETE SET NULL foreign key behaviour.

ALTER TABLE "k8sIngresses" ALTER COLUMN "service_id" DROP NOT NULL;
