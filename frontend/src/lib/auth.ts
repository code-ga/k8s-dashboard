import { createAuthClient } from "better-auth/react";
import { BACKEND_URL } from "@/constants";

export const authClient = createAuthClient({
	baseURL: `${BACKEND_URL}/auth/api`,
	fetchOptions: {
		redirect: "follow",
	},
});
