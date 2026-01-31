import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../../database";
import {
	user,
	session,
	account,
	verification,
	schema,
} from "../../database/schema";
import { openAPI } from "better-auth/plugins";
import { FRONTEND_URLs } from "../../constants";

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: { user, session, account, verification },
	}),
	emailAndPassword: {
		enabled: true,
	},
	socialProviders: {
		google: {
			clientId: process.env.GOOGLE_CLIENT_ID || "",
			clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
		},
		github: {
			clientId: process.env.GITHUB_CLIENT_ID || "",
			clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
		},
		discord: {
			clientId: process.env.DISCORD_CLIENT_ID || "",
			clientSecret: process.env.DISCORD_CLIENT_SECRET || "",
		},
	},
	baseURL: process.env.BASE_URL || "http://localhost:3001/api/auth",
	trustedOrigins() {
		return [
			...(process.env.BASE_URL ? [process.env.BASE_URL] : []),
			"http://localhost:3001",
			...FRONTEND_URLs,
		];
	},
	secret: process.env.BETTER_AUTH_SECRET!,
	plugins: [openAPI()],
	// on user account creation, create the role for the user
	databaseHooks: {
		user: {
			create: {
				after: async (user) => {
					// if this is the first user, create the admin role for the user
					if (user.id === "1") {
						await db.insert(schema.profile).values({
							userId: user.id,
							username: user.email,
							permission: ["admin", "default-account"],
						});
					} else {
						await db.insert(schema.profile).values({
							userId: user.id,
							username: user.email,
							permission: [], // admin will be assigned later
						});
					}
				},
			},
		},
	},
});
