import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import {
	Activity,
	ArrowLeft,
	Box,
	Cpu,
	FileJson,
	HardDrive,
	Layers,
	Lock,
	Network,
	Shield,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, getEdenErrorMessage } from "@/lib/api";
import { BACKEND_URL } from "../../../../constants";
import { usePermissions } from "@/hooks/use-permissions";

export const Route = createFileRoute("/dashboard/cluster/$id/")({
	component: ClusterOverview,
});

function ClusterOverview() {
	const { id } = useParams({ from: "/dashboard/cluster/$id/" });
	const queryClient = useQueryClient();
	const { can } = usePermissions();
	const [acmeEmail, setAcmeEmail] = useState("");

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

	const updateAcmeEmailMutation = useMutation({
		mutationFn: async () => {
			const res = await api.api.cluster({ id }).patch({
				acmeEmail,
			});
			if (res.error) {
				const message = getEdenErrorMessage(res.error);
				throw new Error(message);
			}
			return res.data;
		},
		onSuccess: () => {
			toast.success("ACME email updated successfully");
			queryClient.invalidateQueries({ queryKey: ["cluster", id] });
		},
		onError: (error: Error) => {
			toast.error(error.message);
		},
	});

	// Initialize acmeEmail state when cluster data loads
	if (cluster && acmeEmail === "" && cluster.acmeEmail) {
		setAcmeEmail(cluster.acmeEmail);
	}

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
					<h1 className="text-4xl font-bold tracking-tight">{cluster.name}</h1>
					<p className="text-sm text-muted-foreground mt-1">
						{cluster.clusterDomain}
					</p>
				</div>
			</div>

			{/* Metrics Cards */}
			<div className="grid gap-4 md:grid-cols-3">
				<Card className="border-l-4 border-l-blue-500">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Status</CardTitle>
						<Activity className="h-4 w-4 text-blue-500" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold capitalize">
							{cluster.status}
						</div>
						<p className="text-xs text-muted-foreground mt-1">Cluster status</p>
					</CardContent>
				</Card>
				<Card className="border-l-4 border-l-green-500">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">CPU Usage</CardTitle>
						<Cpu className="h-4 w-4 text-green-500" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							{cluster.cpuUsage} / {cluster.cpuCapacity}
						</div>
						<p className="text-xs text-muted-foreground mt-1">Cores</p>
					</CardContent>
				</Card>
				<Card className="border-l-4 border-l-purple-500">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Memory Usage</CardTitle>
						<HardDrive className="h-4 w-4 text-purple-500" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							{cluster.ramUsage} / {cluster.ramCapacity}
						</div>
						<p className="text-xs text-muted-foreground mt-1">RAM</p>
					</CardContent>
				</Card>
			</div>

			{/* Navigation Grid */}
			<div>
				<h3 className="text-lg font-semibold mb-4">Resources</h3>
				<div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
					<Link to={`/dashboard/cluster/$id/nodes`} params={{ id }}>
						<Card className="h-full hover:shadow-md hover:border-primary/50 transition-all cursor-pointer group">
							<CardHeader className="pb-3">
								<CardTitle className="text-base flex items-center gap-2 group-hover:text-primary transition-colors">
									<HardDrive className="h-5 w-5" /> Nodes
								</CardTitle>
							</CardHeader>
							<CardContent>
								<p className="text-xs text-muted-foreground">
									Manage cluster nodes
								</p>
							</CardContent>
						</Card>
					</Link>
					<Link to={`/dashboard/cluster/$id/pods`} params={{ id }}>
						<Card className="h-full hover:shadow-md hover:border-primary/50 transition-all cursor-pointer group">
							<CardHeader className="pb-3">
								<CardTitle className="text-base flex items-center gap-2 group-hover:text-primary transition-colors">
									<Box className="h-5 w-5" /> Pods
								</CardTitle>
							</CardHeader>
							<CardContent>
								<p className="text-xs text-muted-foreground">
									View and manage pods
								</p>
							</CardContent>
						</Card>
					</Link>
					<Link to={`/dashboard/cluster/$id/deployments`} params={{ id }}>
						<Card className="h-full hover:shadow-md hover:border-primary/50 transition-all cursor-pointer group">
							<CardHeader className="pb-3">
								<CardTitle className="text-base flex items-center gap-2 group-hover:text-primary transition-colors">
									<Layers className="h-5 w-5" /> Deployments
								</CardTitle>
							</CardHeader>
							<CardContent>
								<p className="text-xs text-muted-foreground">
									Manage deployments
								</p>
							</CardContent>
						</Card>
					</Link>
					<Link to={`/dashboard/cluster/$id/services`} params={{ id }}>
						<Card className="h-full hover:shadow-md hover:border-primary/50 transition-all cursor-pointer group">
							<CardHeader className="pb-3">
								<CardTitle className="text-base flex items-center gap-2 group-hover:text-primary transition-colors">
									<Network className="h-5 w-5" /> Services
								</CardTitle>
							</CardHeader>
							<CardContent>
								<p className="text-xs text-muted-foreground">Manage services</p>
							</CardContent>
						</Card>
					</Link>
					<Link to={`/dashboard/cluster/$id/ingresses`} params={{ id }}>
						<Card className="h-full hover:shadow-md hover:border-primary/50 transition-all cursor-pointer group">
							<CardHeader className="pb-3">
								<CardTitle className="text-base flex items-center gap-2 group-hover:text-primary transition-colors">
									<Layers className="h-5 w-5" /> Ingresses
								</CardTitle>
							</CardHeader>
							<CardContent>
								<p className="text-xs text-muted-foreground">
									Service exposure
								</p>
							</CardContent>
						</Card>
					</Link>
					<Link to={`/dashboard/cluster/$id/configmaps`} params={{ id }}>
						<Card className="h-full hover:shadow-md hover:border-primary/50 transition-all cursor-pointer group">
							<CardHeader className="pb-3">
								<CardTitle className="text-base flex items-center gap-2 group-hover:text-primary transition-colors">
									<FileJson className="h-5 w-5" /> ConfigMaps
								</CardTitle>
							</CardHeader>
							<CardContent>
								<p className="text-xs text-muted-foreground">
									Configuration data
								</p>
							</CardContent>
						</Card>
					</Link>
					<Link to={`/dashboard/cluster/$id/secrets`} params={{ id }}>
						<Card className="h-full hover:shadow-md hover:border-primary/50 transition-all cursor-pointer group">
							<CardHeader className="pb-3">
								<CardTitle className="text-base flex items-center gap-2 group-hover:text-primary transition-colors">
									<Lock className="h-5 w-5" /> Secrets
								</CardTitle>
							</CardHeader>
							<CardContent>
								<p className="text-xs text-muted-foreground">Sensitive data</p>
							</CardContent>
						</Card>
					</Link>
				</div>
			</div>

			{/* ACME Configuration */}
			<Card className="border-2 border-green-500/30 bg-linear-to-br from-green-50/50 to-transparent dark:from-green-950/20">
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Shield className="h-5 w-5 text-green-600" />
						ACME / Let's Encrypt Configuration
					</CardTitle>
					<CardDescription>
						Configure automatic SSL certificate generation via Let's Encrypt
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="acme-email">ACME Email</Label>
						<div className="flex gap-2">
							<Input
								id="acme-email"
								type="email"
								value={acmeEmail}
								onChange={(e) => setAcmeEmail(e.target.value)}
								placeholder="ops@example.com"
								className="flex-1"
							/>
							<Button
								variant="default"
								onClick={() => updateAcmeEmailMutation.mutate()}
								disabled={
									!can("cluster:manage") ||
									updateAcmeEmailMutation.isPending ||
									!acmeEmail ||
									acmeEmail === cluster?.acmeEmail
								}
							>
								{updateAcmeEmailMutation.isPending ? "Updating..." : "Update"}
							</Button>
						</div>
						{!can("cluster:manage") && (
							<p className="text-xs text-destructive mt-1">
								You do not have permission to update ACME settings.
							</p>
						)}
						<p className="text-xs text-muted-foreground">
							Email address for Let's Encrypt certificate notifications and
							recovery
						</p>
					</div>

					<div className="bg-secondary/50 p-3 rounded-md space-y-2">
						<p className="text-xs font-medium">Current Configuration</p>
						<div className="space-y-1">
							<p className="text-xs">
								<span className="font-medium">Email:</span>{" "}
								{cluster?.acmeEmail || "Not configured"}
							</p>
							<p className="text-xs">
								<span className="font-medium">Challenge Type:</span> HTTP-01
							</p>
							<p className="text-xs">
								<span className="font-medium">Certificate Resolver:</span>{" "}
								letsencrypt
							</p>
						</div>
					</div>

					<div className="bg-yellow-500/10 border border-yellow-500/30 p-3 rounded-md">
						<p className="text-xs font-medium text-yellow-700 dark:text-yellow-500 mb-1">
							⚠️ Important
						</p>
						<ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
							<li>Port 80 must be accessible for HTTP-01 challenge</li>
							<li>Ensure your domain DNS points to the cluster</li>
							<li>Certificates auto-renew every 90 days</li>
							<li>Changes require agent restart to take effect</li>
						</ul>
					</div>
				</CardContent>
			</Card>

			{/* Agent Configuration */}
			{agentConfig && (
				<Card className="border-2 border-amber-500/30 bg-linear-to-br from-amber-50/50 to-transparent dark:from-amber-950/20">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Lock className="h-5 w-5 text-amber-600" />
							Agent Setup
						</CardTitle>
						<CardDescription>
							Install and configure the K8s agent
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="space-y-2">
							<label className="text-sm font-medium" htmlFor="cluster-token">
								Cluster Token
							</label>
							<div className="flex gap-2">
								<code
									className="flex-1 bg-secondary px-3 py-2 rounded-md text-xs font-mono overflow-x-auto"
									id="cluster-token"
								>
									{agentConfig.clusterToken}
								</code>
								<Button
									variant="outline"
									size="sm"
									onClick={() =>
										navigator.clipboard.writeText(agentConfig.clusterToken)
									}
								>
									Copy
								</Button>
							</div>
						</div>

						<div className="bg-secondary/50 p-3 rounded-md space-y-2">
							<p className="text-xs font-medium">Installation Command</p>
							<code className="block bg-background px-3 py-2 rounded text-xs font-mono overflow-x-auto">
								{`agent --addr ${BACKEND_URL} --token ${agentConfig.clusterToken}`}
							</code>
						</div>

						<div className="flex flex-col gap-2">
							<a
								href="https://github.com/code-ga/k8s-dashboard/releases/latest"
								target="_blank"
								rel="noopener noreferrer"
							>
								<Button variant="default" className="w-full" size="sm">
									Download Agent
								</Button>
							</a>
							<p className="text-xs text-muted-foreground">
								Requires node master/root permissions
							</p>
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
