import {
	boolean,
	integer,
	jsonb,
	pgTable,
	serial,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { k8sCluster } from "./cluster";
import { k8sServices } from "./k8s-resources";

export interface AppState {
	createNewAdmin: boolean;
}

export const AppState = pgTable("app_state", {
	id: serial("id").primaryKey(),

	state: jsonb("state").notNull().$type<AppState>().default({
		createNewAdmin: true,
	}),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});

export const gatewayPorts = pgTable("gateway_ports", {
	id: serial("id").primaryKey(),
	clusterId: integer("cluster_id")
		.notNull()
		.references(() => k8sCluster.id, { onDelete: "cascade" }),
	protocol: text("protocol").notNull(), // tcp | udp | http
	port: integer("port").notNull(),
	allocated: boolean("allocated").default(false).notNull(),
	serviceId: integer("service_id").references(() => k8sServices.id, {
		onDelete: "set null",
	}),
});
