import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useParams } from "@tanstack/react-router";
import {
	CheckCircle2,
	Copy,
	HardDrive,
	Plus,
	Trash2,
	XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ResourcePageLayout } from "@/components/shared/resource-page-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { usePermissions } from "@/hooks/use-permissions";
import { api, getEdenErrorMessage } from "@/lib/api";

export const Route = createFileRoute("/_protected/dashboard/cluster/$id/nodes")(
	{
		component: ClusterNodes,
	},
);

function ClusterNodes() {
	const { id } = useParams({ from: "/_protected/dashboard/cluster/$id/nodes" });
	const { can, isLoading: isLoadingPermissions } = usePermissions();
	const queryClient = useQueryClient();
	const [isJoinDialogOpen, setIsJoinDialogOpen] = useState(false);

	const { data: nodes, isLoading } = useQuery({
		queryKey: ["nodes", id],
		queryFn: async () => {
			const res = await api.api.nodes({ clusterId: id }).get();
			if (res.error) throw res.error;
			if (!res.data.data)
				throw new Error(res.data.message || "Failed to fetch nodes");
			return res.data.data;
		},
		enabled: can("node:read"),
	});

	const {
		data: joinToken,
		mutate: fetchJoinToken,
		isPending: isFetchingToken,
	} = useMutation({
		mutationFn: async () => {
			const res = await api.api.nodes({ clusterId: id }).token.get();
			if (res.error) throw res.error;
			return res.data.data;
		},
		onSuccess: () => {
			setIsJoinDialogOpen(true);
		},
		onError: (err) => {
			toast.error(getEdenErrorMessage(err));
		},
	});

	const deleteNodeMutation = useMutation({
		mutationFn: async (nodeId: number) => {
			const res = await api.api
				.nodes({ clusterId: id })({ id: nodeId })
				.delete();
			if (res.error) throw res.error;
			if (!res.data.data)
				throw new Error(res.data.message || "Failed to delete node");
			return res.data.data;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["nodes", id] });
			toast.success("Node deletion initiated");
		},
		onError: (err) => {
			toast.error(getEdenErrorMessage(err));
		},
	});

	const copyToClipboard = (text: string) => {
		navigator.clipboard.writeText(text);
		toast.success("Command copied to clipboard");
	};

	if (!can("node:read") && !isLoadingPermissions) {
		return (
			<div className="flex items-center justify-center py-12">
				<div className="text-center">
					<h2 className="text-xl font-semibold text-muted-foreground">
						Access Denied
					</h2>
					<p className="text-sm text-muted-foreground mt-2">
						You don't have permission to view nodes.
					</p>
				</div>
			</div>
		);
	}

	if (isLoading)
		return (
			<div className="p-8 text-center text-muted-foreground animate-pulse font-medium tracking-tight">
				Loading nodes...
			</div>
		);

	return (
		<ResourcePageLayout
			title="Nodes"
			subtitle="Cluster infrastructure"
			description="Kubernetes runs your workload by placing containers into Pods to run on Nodes. A node may be a virtual or physical machine, depending on the cluster."
			helpLink="https://kubernetes.io/docs/concepts/architecture/nodes/"
			extraActions={
				can("node:manage") && (
					<Button
						onClick={() => fetchJoinToken()}
						disabled={isFetchingToken}
						className="shadow-md transition-all active:scale-95"
					>
						<Plus className="h-4 w-4 mr-2" />
						Add Node
					</Button>
				)
			}
		>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead className="px-6 py-4">Status</TableHead>
						<TableHead className="py-4">Name</TableHead>
						<TableHead className="py-4">Roles</TableHead>
						<TableHead className="py-4">Labels</TableHead>
						<TableHead className="py-4">CPU Usage</TableHead>
						<TableHead className="py-4">RAM Usage</TableHead>
						<TableHead className="text-right px-6 py-4">Actions</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{nodes?.map((node) => (
						<TableRow key={node.id} className="group">
							<TableCell className="px-6 py-4">
								<Badge
									variant={node.status === "Ready" ? "default" : "destructive"}
									className={`flex items-center gap-1 w-fit text-[10px] font-bold uppercase ring-1 ring-inset ${
										node.status === "Ready"
											? "bg-green-100 text-green-700 hover:bg-green-100 ring-green-600/20"
											: "bg-red-100 text-red-700 hover:bg-red-100 ring-red-600/20"
									}`}
								>
									{node.status === "Ready" ? (
										<CheckCircle2 className="h-3 w-3" />
									) : (
										<XCircle className="h-3 w-3" />
									)}
									{node.status}
								</Badge>
							</TableCell>
							<TableCell className="font-medium">
								<div className="flex items-center gap-2">
									<HardDrive className="h-4 w-4 text-primary/70" />
									<span className="font-semibold">{node.name}</span>
								</div>
							</TableCell>
							<TableCell>
								<div className="flex flex-wrap gap-1">
									{node.roles &&
									Array.isArray(node.roles) &&
									node.roles.length > 0 ? (
										node.roles.map((role: string) => (
											<Badge
												key={role}
												variant="outline"
												className="text-[10px] uppercase font-bold text-muted-foreground"
											>
												{role}
											</Badge>
										))
									) : (
										<span className="text-xs text-muted-foreground/60 italic font-medium tracking-tight">
											worker
										</span>
									)}
								</div>
							</TableCell>
							<TableCell>
								<div className="flex flex-wrap gap-1 max-w-[200px]">
									{Object.entries(JSON.parse(node.labels || "{}"))
										.slice(0, 2)
										.map(([key, value]) => (
											<span
												key={key}
												className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground truncate"
											>
												{key.split("/").pop()}={new String(value)}
											</span>
										))}
									{Object.keys(JSON.parse(node.labels || "{}")).length > 2 && (
										<span className="text-[10px] text-muted-foreground/50">
											+{Object.keys(JSON.parse(node.labels || "{}")).length - 2}{" "}
											more
										</span>
									)}
								</div>
							</TableCell>
							<TableCell className="font-mono text-xs font-bold text-foreground/80">
								{node.cpuUsage} / {node.cpuCapacity}
							</TableCell>
							<TableCell className="font-mono text-xs font-bold text-foreground/80">
								{node.ramUsage} / {node.ramCapacity}
							</TableCell>
							<TableCell className="text-right px-6">
								<div className="flex justify-end gap-1">
									{can("node:manage") && (
										<Button
											variant="ghost"
											size="icon"
											className="h-8 w-8 text-muted-foreground hover:text-destructive transition-colors"
											onClick={() => {
												if (
													confirm("Are you sure you want to delete this node?")
												) {
													deleteNodeMutation.mutate(node.id);
												}
											}}
										>
											<Trash2 className="h-4 w-4" />
										</Button>
									)}
								</div>
							</TableCell>
						</TableRow>
					))}
					{(!nodes || nodes.length === 0) && (
						<TableRow>
							<TableCell
								colSpan={7}
								className="text-center py-24 text-muted-foreground/50"
							>
								<div className="flex flex-col items-center justify-center space-y-4">
									<HardDrive className="h-12 w-12 opacity-20" />
									<p className="text-xl font-semibold text-foreground/70">
										No nodes connected
									</p>
								</div>
							</TableCell>
						</TableRow>
					)}
				</TableBody>
			</Table>

			<Dialog open={isJoinDialogOpen} onOpenChange={setIsJoinDialogOpen}>
				<DialogContent className="max-w-2xl">
					<DialogHeader>
						<DialogTitle className="text-2xl font-bold tracking-tight">
							Join a New Node
						</DialogTitle>
						<DialogDescription className="text-base">
							Run this command on your machine to join it to the cluster as a
							worker node.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-6 pt-4">
						<div className="relative group">
							<div className="bg-zinc-950 text-zinc-100 p-6 rounded-xl font-mono text-xs break-all pr-14 border border-white/10 shadow-2xl">
								{joinToken?.command}
							</div>
							<Button
								size="icon"
								variant="ghost"
								className="absolute right-3 top-3 opacity-50 group-hover:opacity-100 transition-opacity text-white hover:text-white hover:bg-white/10"
								onClick={() => copyToClipboard(joinToken?.command || "")}
							>
								<Copy className="h-4 w-4" />
							</Button>
						</div>
						<div className="grid grid-cols-2 gap-6 pt-2">
							<div className="space-y-1.5 p-3 rounded-lg bg-muted/50 border border-border/50">
								<p className="text-xs font-bold uppercase tracking-wider text-muted-foreground/70">
									Token
								</p>
								<p className="font-mono text-xs font-semibold truncate">
									{joinToken?.token}
								</p>
							</div>
							<div className="space-y-1.5 p-3 rounded-lg bg-muted/50 border border-border/50">
								<p className="text-xs font-bold uppercase tracking-wider text-muted-foreground/70">
									Expiration
								</p>
								<p className="text-xs font-semibold">
									{joinToken?.expiration
										? new Date(joinToken.expiration).toLocaleString()
										: ""}
								</p>
							</div>
						</div>
					</div>
				</DialogContent>
			</Dialog>
		</ResourcePageLayout>
	);
}
