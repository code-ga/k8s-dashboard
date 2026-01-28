import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
	ArrowLeft,
	Box,
	HardDrive,
	Cpu,
	Activity,
	Layers,
	Network,
} from "lucide-react";

export const Route = createFileRoute("/dashboard/cluster/$id/")({
	component: ClusterOverview,
});

function ClusterOverview() {
	const { id } = useParams({ from: "/dashboard/cluster/$id/" });

	const { data: cluster, isLoading } = useQuery({
		queryKey: ["cluster", id],
		queryFn: async () => {
			const res = await api.api.cluster({ id }).get();
			if (res.error) throw res.error;
			if (!res.data.data)
				throw new Error(res.data.message || "Failed to fetch cluster");
			return res.data.data;
		},
	});

	const { data: agentConfig } = useQuery({
		queryKey: ["cluster", id, "agent"],
		queryFn: async () => {
			const res = await api.api.cluster({ id })["agent-config"].get();
			if (res.error) return null;
			if (!res.data.data)
				throw new Error(res.data.message || "Failed to fetch agent config");
			return res.data.data;
		},
	});

	if (isLoading) return <div>Loading cluster...</div>;
	if (!cluster) return <div>Cluster not found</div>;

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-4">
				<Link to="/dashboard">
					<Button variant="ghost" size="icon">
						<ArrowLeft className="h-4 w-4" />
					</Button>
				</Link>
				<div>
					<h2 className="text-3xl font-bold tracking-tight">{cluster.name}</h2>
					<p className="text-muted-foreground">{cluster.clusterDomain}</p>
				</div>
			</div>

			<div className="grid gap-4 md:grid-cols-3">
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Status</CardTitle>
						<Activity className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold capitalize">
							{cluster.status}
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">CPU Usage</CardTitle>
						<Cpu className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							{cluster.cpuUsage} / {cluster.cpuCapacity}
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">RAM Usage</CardTitle>
						<HardDrive className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							{cluster.ramUsage} / {cluster.ramCapacity}
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Navigation to Resources */}
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mt-8">
				<Link to={`/dashboard/cluster/$id/nodes`} params={{ id }}>
					<Card className="hover:bg-muted/50 transition-colors cursor-pointer">
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<HardDrive className="h-5 w-5" /> Nodes
							</CardTitle>
							<CardContent>Manage cluster nodes</CardContent>
						</CardHeader>
					</Card>
				</Link>
				<Link to={`/dashboard/cluster/$id/pods`} params={{ id }}>
					<Card className="hover:bg-muted/50 transition-colors cursor-pointer">
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<Box className="h-5 w-5" /> Pods
							</CardTitle>
							<CardContent>View and manage pods</CardContent>
						</CardHeader>
					</Card>
				</Link>
				<Link to={`/dashboard/cluster/$id/deployments`} params={{ id }}>
					<Card className="hover:bg-muted/50 transition-colors cursor-pointer">
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<Layers className="h-5 w-5" /> Deployments
							</CardTitle>
							<CardContent>Manage application deployments</CardContent>
						</CardHeader>
					</Card>
				</Link>
				<Link to={`/dashboard/cluster/$id/services`} params={{ id }}>
					<Card className="hover:bg-muted/50 transition-colors cursor-pointer">
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<Network className="h-5 w-5" /> Services
							</CardTitle>
							<CardContent>Manage network services</CardContent>
						</CardHeader>
					</Card>
				</Link>
			</div>

			{agentConfig && (
				<Card className="mt-8 border-yellow-500/50 bg-yellow-500/10">
					<CardHeader>
						<CardTitle>Agent Configuration</CardTitle>
					</CardHeader>
					<CardContent>
						<pre className="bg-secondary p-4 rounded-md overflow-x-auto text-xs">
							{`Token: ${agentConfig.clusterToken}`}
						</pre>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
