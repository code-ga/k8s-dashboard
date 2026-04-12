import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, Box, Plus, Settings } from "lucide-react";
import { DebugPodModal } from "@/components/cluster/debug-pod-modal";
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
import { useAllPods, usePods } from "@/hooks/queries";
import { usePermissions } from "@/hooks/use-permissions";

export const Route = createFileRoute("/dashboard/cluster/$id/pods/")({
	component: ClusterPods,
});

function ClusterPods() {
	const { id } = useParams({ from: "/dashboard/cluster/$id/pods/" });
	const { can, isLoading: isLoadingPermissions } = usePermissions();
	const numericId = Number(id);

	const { data: allPods } = useAllPods(numericId, {
		enabled: can("pod:manage") && !!numericId,
	});

	const { data: userPods, isLoading } = usePods(numericId, {
		enabled: !can("pod:manage") && can("pod:read") && !!numericId,
	});

	const pods = can("pod:manage") ? allPods : userPods;

	if (!can("pod:read") && !can("pod:manage") && !isLoadingPermissions) {
		return (
			<div className="flex items-center justify-center py-12">
				<div className="text-center">
					<h2 className="text-xl font-semibold text-muted-foreground">
						Access Denied
					</h2>
					<p className="text-sm text-muted-foreground mt-2">
						You don't have permission to view pods.
					</p>
				</div>
			</div>
		);
	}

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
				{can("pod:create") && (
					<Link to="/dashboard/cluster/$id/pods/create" params={{ id }}>
						<Button>
							<Plus className="mr-2 h-4 w-4" /> Create Pod
						</Button>
					</Link>
				)}
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
									<TableCell className="text-right flex justify-end gap-2">
										<DebugPodModal
											clusterId={id}
											podId={pod.id.toString()}
											podName={pod.name}
											containers={[pod.dockerImage.split(":")[0]]}
										/>
										<Link
											to="/dashboard/cluster/$id/pods/$podId"
											params={{ id, podId: pod.id.toString() }}
										>
											<Button
												variant="ghost"
												size="sm"
												disabled={!can("pod:read") && !can("pod:manage")}
											>
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
	);
}
