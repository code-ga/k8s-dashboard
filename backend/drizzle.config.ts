import "dotenv/config";
import path from "node:path";
import { defineConfig } from "drizzle-kit";

const config = defineConfig({
	out: "./drizzle",
	schema: "./src/database/schema.ts",
	dialect: "postgresql",
	...(process.env.NODE_ENV === "production"
		? {
				dbCredentials: {
					url: process.env.DATABASE_URL || "",
				},
			}
		: {
				dbCredentials: {
					url: path.join(__dirname, "dev-db"),
				},
				driver: "pglite",
			}),
});

console.log("Drizzle configuration:", config);
export default config;
