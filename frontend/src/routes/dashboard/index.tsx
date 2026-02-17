import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Server } from "lucide-react";
import { CreateClusterDialog } from "@/components/cluster/create-cluster-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth";

export const Route = createFileRoute("/dashboard/")({
	component: DashboardIndex,
});

function DashboardIndex() {
	const { data: clusters, isLoading } = useQuery({
		queryKey: ["clusters"],
		queryFn: async () => {
			const res = await api.api.cluster.get();
			if (res.error) throw res.error;
			if (!res.data.data)
				throw new Error(res.data.message || "Failed to fetch clusters");
			return res.data.data;
		},
	});

	// We can also check permission here if we want to show/hide the create button
	// But for now let's just use session to verify if they are at least manager?
	// Wait, we need the profile role. DashboardLayout fetches it but doesn't pass it down explicitly.
	// We can refetch or use context?
	// Ideally, `DashboardLayout` should put profile in a Route Context.
	// But strictly, we can check permissions by fetching profile again (cached) or using a dedicated hook.

	// For now we will just show the button and let backend reject if not allowed,
	// OR we can fetch profile here too (it will be cached by React Query).

	const { data: session } = authClient.useSession();
	const { data: profile, isLoading: isLoadingProfile } = useQuery({
		queryKey: ["profile", session?.user?.id],
		queryFn: async () => {
			const res = await api.api.profile.me.get();
			if (res.error) throw res.error;
			if (!res.data.data)
				throw new Error(res.data.message || "Failed to fetch profile");
			return res.data.data;
		},
		enabled: !!session?.user?.id,
	});

	const permissions = (profile?.permission as string[]) || [];
	const canCreate =
		permissions.includes("manager") || permissions.includes("admin");

	if (isLoading || isLoadingProfile) return <div>Loading clusters...</div>;

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-3xl font-bold tracking-tight">Clusters</h2>
					<p className="text-muted-foreground">
						Manage your Kubernetes clusters
					</p>
				</div>
				{canCreate && <CreateClusterDialog />}
			</div>

			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
				{clusters?.map((cluster) => (
					<Link
						key={cluster.id}
						to={`/dashboard/cluster/$id`}
						params={{ id: `${cluster.id}` }}
						className="block h-full"
					>
						<Card className="h-full hover:bg-muted/50 transition-colors cursor-pointer">
							<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
								<CardTitle className="text-sm font-medium">
									{cluster.name}
								</CardTitle>
								<Server className="h-4 w-4 text-muted-foreground" />
							</CardHeader>
							<CardContent>
								<div className="text-2xl font-bold">
									{cluster.clusterDomain}
								</div>
								<p className="text-xs text-muted-foreground">
									{cluster.description || "No description"}
								</p>
								<div className="mt-2 text-xs text-muted-foreground">
									Status:{" "}
									<span
										className={
											cluster.status === "active"
												? "text-green-500"
												: "text-gray-500"
										}
									>
										{cluster.status}
									</span>
								</div>
							</CardContent>
						</Card>
					</Link>
				))}

				{clusters?.length === 0 && (
					<div className="col-span-full text-center text-muted-foreground py-12">
						No clusters found.
					</div>
				)}
			</div>
		</div>
	);
}
