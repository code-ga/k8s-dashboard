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
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, Layers } from "lucide-react";

export const Route = createFileRoute("/dashboard/cluster/$id/deployments")({
	component: ClusterDeployments,
});

function ClusterDeployments() {
	const { id } = useParams({ from: "/dashboard/cluster/$id/deployments" });

	const { data: deployments, isLoading } = useQuery({
		queryKey: ["deployments", id],
		queryFn: async () => {
			// Using Treaty to fetch deployments
			const res = await api.api.deployments({ clusterId: id }).get();
			if (res.error) throw res.error;
			if (!res.data.data)
				throw new Error(res.data.message || "Failed to fetch deployments");
			return res.data.data;
		},
	});

	if (isLoading) return <div>Loading deployments...</div>;

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-4">
				<Link to={`/dashboard/cluster/$id`} params={{ id }}>
					<Button variant="ghost" size="icon">
						<ArrowLeft className="h-4 w-4" />
					</Button>
				</Link>
				<div>
					<h2 className="text-3xl font-bold tracking-tight">Deployments</h2>
					<p className="text-muted-foreground">
						List of deployments in this cluster
					</p>
				</div>
			</div>

			<Card>
				<CardContent className="p-0">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Name</TableHead>
								<TableHead>Namespace</TableHead>
								<TableHead>Replicas</TableHead>
								<TableHead>Image</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{deployments?.map((dep) => (
								<TableRow key={dep.id}>
									<TableCell className="font-medium flex items-center gap-2">
										<Layers className="h-4 w-4 text-blue-500" />
										{dep.name}
									</TableCell>
									<TableCell>{dep.namespace}</TableCell>
									<TableCell>
										{dep.availableReplicas} / {dep.replicas}
									</TableCell>
									<TableCell
										className="max-w-[200px] truncate"
										title={dep.dockerImage || ""}
									>
										{dep.dockerImage}
									</TableCell>
								</TableRow>
							))}
							{(!deployments || deployments.length === 0) && (
								<TableRow>
									<TableCell colSpan={4} className="text-center py-4">
										No deployments found
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
		</div>
	);
}
