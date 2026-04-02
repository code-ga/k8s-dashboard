import {
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { clusterAgent, k8sCluster } from "./cluster";

export const agentCommandStatus = pgEnum("agent_command_status", [
	"pending",
	"sent",
	"success",
	"failed",
	"timeout",
]);

export const agentCommands = pgTable("agentCommands", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	agentId: integer("agent_id")
		.notNull()
		.references(() => clusterAgent.id, { onDelete: "cascade" }),
	clusterId: integer("cluster_id")
		.notNull()
		.references(() => k8sCluster.id, { onDelete: "cascade" }),
	type: text("type").notNull(),
	payload: jsonb("payload").notNull(),
	status: agentCommandStatus("status").default("pending").notNull(),

	result: jsonb("result"),
	errorMessage: text("error_message"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});
