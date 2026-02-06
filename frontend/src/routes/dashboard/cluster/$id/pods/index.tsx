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
import { ArrowLeft, Box, Plus, Settings } from "lucide-react";

export const Route = createFileRoute("/dashboard/cluster/$id/pods/")({
	component: ClusterPods,
});

function ClusterPods() {
	const { id } = useParams({ from: "/dashboard/cluster/$id/pods/" });

	const { data: pods, isLoading } = useQuery({
		queryKey: ["pods", id],
		queryFn: async () => {
			const res = await api.api.pods({ clusterId: id }).get();
			if (res.error) throw res.error;
			if (!res.data.data)
				throw new Error(res.data.message || "Failed to fetch pods");
			return res.data.data;
		},
	});

	if (isLoading) return <div>Loading pods...</div>;

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-4">
					<Link to={`/dashboard/cluster/$id`} params={{ id }}>
						<Button variant="ghost" size="icon">
							<ArrowLeft className="h-4 w-4" />
						</Button>
					</Link>
					<div>
						<h2 className="text-3xl font-bold tracking-tight">Pods</h2>
						<p className="text-muted-foreground">
							List of pods in this cluster
						</p>
					</div>
				</div>
				<Link to="/dashboard/cluster/$id/pods/create" params={{ id }}>
					<Button>
						<Plus className="mr-2 h-4 w-4" /> Create Pod
					</Button>
				</Link>
			</div>

			<Card>
				<CardContent className="p-0">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Name</TableHead>
								<TableHead>Namespace</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>Image</TableHead>
								<TableHead>CPU / MEM</TableHead>
								<TableHead className="text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{pods?.map((pod) => (
								<TableRow key={pod.id}>
									<TableCell className="font-medium flex items-center gap-2">
										<Box className="h-4 w-4 text-blue-500" />
										{pod.name}
									</TableCell>
									<TableCell>{pod.namespace}</TableCell>
									<TableCell>{pod.status || "Running"}</TableCell>
									<TableCell
										className="max-w-[200px] truncate"
										title={pod.dockerImage}
									>
										{pod.dockerImage}
									</TableCell>
									<TableCell>
										{pod.cpuRequest}m / {pod.memoryRequest}Mi
									</TableCell>
									<TableCell className="text-right">
										<Link
											to="/dashboard/cluster/$id/pods/$podId"
											params={{ id, podId: pod.id.toString() }}
										>
											<Button variant="ghost" size="sm">
												<Settings className="h-4 w-4" />
											</Button>
										</Link>
									</TableCell>
								</TableRow>
							))}
							{(!pods || pods.length === 0) && (
								<TableRow>
									<TableCell colSpan={6} className="text-center py-4">
										No pods found
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
		</div>
	)
}
