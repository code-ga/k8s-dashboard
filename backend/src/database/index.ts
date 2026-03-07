import { logger } from "../utils/logger";
// import { PGlite } from "@electric-sql/pglite";

import path from "node:path";
import { drizzle as drizzlePostgres } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePGlite } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { schema, schemaRelations } from "./schema";

const isProduction = process.env.NODE_ENV === "production";

const dbUrl = process.env.DATABASE_URL?.replace(/^"|"$/g, "") || "memory://";
export const db = isProduction
	? drizzlePostgres(dbUrl, {
			schema,
			relations: schemaRelations,
		})
	: drizzlePGlite(dbUrl, { schema, relations: schemaRelations });

if (!isProduction) {
	// For Electric, we need to initialize the database
	// This is not needed for production with a real Postgres database
	try {
		logger.info("Running migrations...");
		await migrate(db, {
			migrationsFolder: path.join(__dirname, "../../drizzle"),
		});
		logger.info("Migrations complete.");
	} catch (error) {
		logger.error("Error running migrations:", error);
	}
}
