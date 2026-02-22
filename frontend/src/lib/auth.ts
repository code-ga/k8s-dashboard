import { createAuthClient } from "better-auth/react";
import { BACKEND_URL } from "@/constants";

export const authClient = createAuthClient({
	baseURL: `${BACKEND_URL}/api/auth`,
	fetchOptions: {
		redirect: "follow",
	},
});
