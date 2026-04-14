import { createAuthClient } from "better-auth/react";
import { BACKEND_URL } from "@/constants";

const getStoredToken = () => {
	if (typeof window === "undefined") return "";
	return localStorage.getItem("bearer_token") || "";
};

export const authClient = createAuthClient({
	baseURL: `${BACKEND_URL}`,
	fetchOptions: {
		redirect: "follow",
		onResponse: ({ response }) => {
			const authToken = response.headers.get("set-auth-token");
			if (authToken) {
				localStorage.setItem("bearer_token", decodeURIComponent(authToken));
			}
		},
		auth: {
			type: "Bearer",
			token: getStoredToken,
		},
	},
});

export function getBearerToken(): string {
	return getStoredToken();
}
