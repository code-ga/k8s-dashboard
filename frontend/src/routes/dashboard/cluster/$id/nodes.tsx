import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import {
	ArrowLeft,
	HardDrive,
	Plus,
	Trash2,
	Copy,
	CheckCircle2,
	XCircle,
} from "lucide-react";
import { useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/dashboard/cluster/$id/nodes")({
	component: ClusterNodes,
});

function ClusterNodes() {
	const { id } = useParams({ from: "/dashboard/cluster/$id/nodes" });
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
			console.error(err);
			toast.error("Failed to fetch join token");
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
			console.error(err);
			toast.error("Failed to delete node");
		},
	});

	const copyToClipboard = (text: string) => {
		navigator.clipboard.writeText(text);
		toast.success("Command copied to clipboard");
	};

	if (isLoading) return <div>Loading nodes...</div>;

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-4">
				<Link to={`/dashboard/cluster/$id`} params={{ id }}>
					<Button variant="ghost" size="icon">
						<ArrowLeft className="h-4 w-4" />
					</Button>
				</Link>
				<div className="flex-1">
					<h2 className="text-3xl font-bold tracking-tight">Nodes</h2>
					<p className="text-muted-foreground">Manage cluster nodes</p>
				</div>
				<Button onClick={() => fetchJoinToken()} disabled={isFetchingToken}>
					<Plus className="h-4 w-4 mr-2" />
					Add Node
				</Button>
			</div>

			<Card>
				<CardContent className="p-0">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Status</TableHead>
								<TableHead>Name</TableHead>
								<TableHead>Roles</TableHead>
								<TableHead>Label</TableHead>
								<TableHead>CPU Usage (mCore)</TableHead>
								<TableHead>RAM Usage (MiB)</TableHead>
								<TableHead className="text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{nodes?.map((node) => (
								<TableRow key={node.id}>
									<TableCell>
										<Badge
											variant={
												node.status === "Ready" ? "default" : "destructive"
											}
											className="flex items-center gap-1 w-fit"
										>
											{node.status === "Ready" ? (
												<CheckCircle2 className="h-3 w-3" />
											) : (
												<XCircle className="h-3 w-3" />
											)}
											{node.status}
										</Badge>
									</TableCell>
									<TableCell className="font-medium flex items-center gap-2">
										<HardDrive className="h-4 w-4 text-gray-500" />
										{node.name}
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
														className="text-[10px] uppercase"
													>
														{role}
													</Badge>
												))
											) : (
												<span className="text-xs text-muted-foreground italic">
													worker
												</span>
											)}
										</div>
									</TableCell>
									<TableCell>
										<span className="bg-secondary px-2 py-1 rounded text-xs">
											{node.labels}
										</span>
									</TableCell>
									<TableCell>
										{node.cpuUsage} / {node.cpuCapacity}
									</TableCell>
									<TableCell>
										{node.ramUsage} / {node.ramCapacity}
									</TableCell>
									<TableCell className="text-right">
										<Button
											variant="ghost"
											size="icon"
											className="text-destructive hover:bg-destructive/10"
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
									</TableCell>
								</TableRow>
							))}
							{(!nodes || nodes.length === 0) && (
								<TableRow>
									<TableCell colSpan={7} className="text-center py-4">
										No nodes connected.
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				</CardContent>
			</Card>

			<Dialog open={isJoinDialogOpen} onOpenChange={setIsJoinDialogOpen}>
				<DialogContent className="max-w-2xl">
					<DialogHeader>
						<DialogTitle>Join a New Node</DialogTitle>
						<DialogDescription>
							Run this command on your machine to join it to the cluster as a
							worker node.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4">
						<div className="relative group">
							<div className="bg-zinc-950 text-zinc-100 p-4 rounded-lg font-mono text-xs break-all pr-12">
								{joinToken?.command}
							</div>
							<Button
								size="icon"
								variant="ghost"
								className="absolute right-2 top-2 opacity-50 group-hover:opacity-100 transition-opacity text-white hover:text-white hover:bg-white/10"
								onClick={() => copyToClipboard(joinToken?.command || "")}
							>
								<Copy className="h-4 w-4" />
							</Button>
						</div>
						<div className="grid grid-cols-2 gap-4 text-xs">
							<div className="space-y-1">
								<p className="text-muted-foreground">Token</p>
								<p className="font-mono bg-secondary px-2 py-1 rounded truncate">
									{joinToken?.token}
								</p>
							</div>
							<div className="space-y-1">
								<p className="text-muted-foreground">Expiration</p>
								<p className="bg-secondary px-2 py-1 rounded">
									{joinToken?.expiration
										? new Date(joinToken.expiration).toLocaleString()
										: ""}
								</p>
							</div>
						</div>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
