import { createFileRoute, redirect } from "@tanstack/react-router";
import { authClient } from "@/lib/auth";

export const Route = createFileRoute("/")({
	beforeLoad: async () => {
		const session = await authClient.getSession();
		if (session.data) {
			throw redirect({
				to: "/dashboard",
			});
		} else {
			throw redirect({
				to: "/login",
			});
		}
	},
	component: () => null,
});
