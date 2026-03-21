import { TanStackDevtools } from "@tanstack/react-devtools";
import { useQuery } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	Outlet,
	useLocation,
	useNavigate,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { Toaster } from "sonner";
import Header from "../components/Header";
import { Sidebar } from "../components/Sidebar";
import { ThemeProvider } from "../components/theme-provider";
import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth";

interface MyRouterContext {
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
	component: () => {
		const location = useLocation();
		const navigate = useNavigate();
		const isLoginPage = location.pathname === "/login";

		const { data: session } = authClient.useSession();
		const {
			data: profile,
			error: profileError,
			isPending: isProfileLoading,
		} = useQuery({
			queryKey: ["profile", session?.user?.id],
			queryFn: async () => {
				const res = await api.api.profile.me.get();
				if (res.error) throw res.error;
				return res.data.data;
			},
			enabled: !!session?.user?.id,
			retry: false,
		});

		// const role = profile?.rolesIDs?.[0] || "viewer";
		const role = profile?.username || "viewer";

		if (isLoginPage || location.pathname === "/onboarding") {
			return (
				<ThemeProvider defaultTheme="dark" storageKey="k8s-dashboard-theme">
					<Outlet />
					<Toaster position="top-center" richColors />
				</ThemeProvider>
			);
		}

		if (
			session &&
			!isProfileLoading &&
			profileError &&
			(profileError as any).status === 404
		) {
			navigate({ to: "/onboarding" });
			return null;
		}

		return (
			<ThemeProvider defaultTheme="dark" storageKey="k8s-dashboard-theme">
				<div className="flex overflow-hidden bg-background">
					{/* Persistent Sidebar on Desktop */}
					<Sidebar role={role} className="hidden lg:flex" />

					<div className="flex flex-col flex-1 overflow-hidden">
						<Header />
						<main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
							<div className="mx-auto max-w-7xl animate-in fade-in slide-in-from-bottom-2 duration-500">
								<Outlet />
							</div>
						</main>
					</div>
				</div>

				<Toaster position="top-center" richColors />
				<TanStackDevtools
					config={{
						position: "bottom-right",
					}}
					plugins={[
						{
							name: "Tanstack Router",
							render: <TanStackRouterDevtoolsPanel />,
						},
						TanStackQueryDevtools,
					]}
				/>
			</ThemeProvider>
		);
	},
});
