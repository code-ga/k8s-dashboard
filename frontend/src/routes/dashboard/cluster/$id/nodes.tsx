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
import { ArrowLeft, HardDrive, Trash2 } from "lucide-react";

export const Route = createFileRoute("/dashboard/cluster/$id/nodes")({
	component: ClusterNodes,
});

function ClusterNodes() {
	const { id } = useParams({ from: "/dashboard/cluster/$id/nodes" });
	const queryClient = useQueryClient();

	const { data: nodes, isLoading } = useQuery({
		queryKey: ["nodes", id],
		queryFn: async () => {
			const res = await api.api.nodes({ clusterId: id }).get();
			if (res.error) throw res.error;
			if (!res.data.data) throw new Error(res.data.message || "Failed to fetch nodes");
			return res.data.data;
		},
	});

	const deleteNodeMutation = useMutation({
		mutationFn: async (nodeId: number) => {
			const res = await api.api.nodes({ clusterId: id })({ id: nodeId }).delete();
			if (res.error) throw res.error;
			if (!res.data.data) throw new Error(res.data.message || "Failed to delete node");
			return res.data.data;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["nodes", id] });
		},
		onError: (_err) => {
			alert("Failed to delete node");
		},
	});

	// Check management permission
	// const { data: session } = authClient.useSession();
	// We can fetch profile or trust backend. UI should hide button if not allowed.

	if (isLoading) return <div>Loading nodes...</div>;

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-4">
				<Link to={`/dashboard/cluster/$id`} params={{ id }}>
					<Button variant="ghost" size="icon">
						<ArrowLeft className="h-4 w-4" />
					</Button>
				</Link>
				<div>
					<h2 className="text-3xl font-bold tracking-tight">Nodes</h2>
					<p className="text-muted-foreground">Manage cluster nodes</p>
				</div>
			</div>

			<Card>
				<CardContent className="p-0">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Name</TableHead>
								<TableHead>Label</TableHead>
								<TableHead>CPU Usage (mCore)</TableHead>
								<TableHead>RAM Usage (MiB)</TableHead>
								<TableHead className="text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{nodes?.map((node) => (
								<TableRow key={node.id}>
									<TableCell className="font-medium flex items-center gap-2">
										<HardDrive className="h-4 w-4 text-gray-500" />
										{node.name}
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
									<TableCell colSpan={5} className="text-center py-4">
										No nodes connected.
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				</CardContent>
			</Card>

			<div className="bg-muted/50 p-4 rounded-lg text-sm text-muted-foreground">
				<p>
					To add a node, install the agent on your worker machine and use the
					Cluster Token from the overview page.
				</p>
			</div>
		</div>
	);
}
