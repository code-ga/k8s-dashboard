import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { authClient } from "@/lib/auth";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { Sidebar } from "@/components/Sidebar";
import type { Role } from "@/config/permissions";

export const Route = createFileRoute("/dashboard")({
	beforeLoad: async ({ location }) => {
		const session = await authClient.getSession();
		if (!session.data) {
			throw redirect({
				to: "/login",
				search: {
					redirect: location.href,
				},
			});
		}
	},
	component: DashboardLayout,
});

function DashboardLayout() {
	const { data: session } = authClient.useSession();

	const { data: profile, isLoading } = useQuery({
		queryKey: ["profile", session?.user?.id],
		queryFn: async () => {
			const res = await api.api.profile.me.get();
			if (res.error) throw res.error;
			return res.data;
		},
		enabled: !!session?.user?.id,
	});

	// Determine role from profile permissions
	// Priority: admin > manager > user
	const getRole = (permissions: string[] = []): Role => {
		if (permissions.includes("admin")) return "admin";
		if (permissions.includes("manager")) return "manager";
		return "user";
	};

	const role = profile ? getRole(profile.permission as string[]) : "user";

	if (isLoading) {
		return (
			<div className="flex h-screen items-center justify-center">
				Loading...
			</div>
		);
	}

	return (
		<div className="flex h-screen w-full bg-background">
			<Sidebar role={role} />
			<main className="flex-1 overflow-auto p-8">
				<div className="flex justify-end mb-4">
					<div className="flex items-center gap-4">
						<span className="text-sm text-muted-foreground">
							{session?.user?.email} ({role})
						</span>
					</div>
				</div>
				<Outlet />
			</main>
		</div>
	);
}
