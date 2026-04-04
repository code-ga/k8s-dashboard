import { createFileRoute, Outlet } from "@tanstack/react-router";
import { authClient } from "@/lib/auth";

export const Route = createFileRoute("/dashboard-layout")({
	beforeLoad: async () => {
		const session = await authClient.getSession();
		if (!session.data) {
			throw window.location.assign("/login");
		}
	},
	component: () => <Outlet />,
});

declare module "@tanstack/react-router" {
	interface FileRouteOption {
		fileRoute: "/dashboard-layout.tsx";
	}
}
