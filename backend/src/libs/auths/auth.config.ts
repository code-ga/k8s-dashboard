import { betterAuth, type CookieOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { openAPI } from "better-auth/plugins";
import { FRONTEND_URLs } from "../../constants";
import { db } from "../../database";
import { account, session, user, verification } from "../../database/schema";

const cookieOptions: CookieOptions = {
	sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
	secure: process.env.NODE_ENV === "production",
	partitioned: true,
	domain: FRONTEND_URLs.map((url) => new URL(url).hostname)[0] || "localhost",
};

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: { user, session, account, verification },
	}),
	emailAndPassword: {
		enabled: true,
		autoSignIn: true,
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
			...(process.env.BACKEND_URL ? process.env.BACKEND_URL.split(",") : []),
			"http://localhost:3001",
			...FRONTEND_URLs,
		];
	},
	secret: process.env.BETTER_AUTH_SECRET!,
	plugins: [openAPI()],
	advanced: {
		// cookies: {
		// 	session_token: {
		// 		attributes: cookieOptions,
		// 	},
		// 	state: {
		// 		attributes: cookieOptions,
		// 	},
		// },
		defaultCookieAttributes: cookieOptions,
		crossSubDomainCookies: {
			enabled: true,
		},
	},
});
