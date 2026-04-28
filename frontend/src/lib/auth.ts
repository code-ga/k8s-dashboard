import { createAuthClient } from "better-auth/react";
import { BACKEND_URL } from "@/constants";

export const authClient = createAuthClient({
	baseURL: `${window.location.origin}${BACKEND_URL}`,
	fetchOptions: {
		redirect: "follow",
		credentials: "include",
	},
});
