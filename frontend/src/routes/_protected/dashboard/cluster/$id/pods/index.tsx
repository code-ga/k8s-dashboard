import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { Box, Settings } from "lucide-react";
import { ResourcePageLayout } from "@/components/shared/resource-page-layout";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { usePermissions } from "@/hooks/use-permissions";
import { api } from "@/lib/api";
import { DebugPodModal } from "@/components/cluster/debug-pod-modal";

export const Route = createFileRoute("/_protected/dashboard/cluster/$id/pods/")(
	{
		component: ClusterPods,
	},
);

function ClusterPods() {
	const { id } = useParams({ from: "/_protected/dashboard/cluster/$id/pods/" });
	const { can, isLoading: isLoadingPermissions } = usePermissions();

	const { data: pods, isLoading } = useQuery({
		queryKey: ["pods", id],
		queryFn: async () => {
			const res = can("pod:manage")
				? await api.api.pods({ clusterId: id }).all.get()
				: await api.api.pods({ clusterId: id }).get();
			if (res.error) throw res.error;
			if (!res.data.data)
				throw new Error(res.data.message || "Failed to fetch pods");
			return res.data.data;
		},
		enabled: can("pod:read") || can("pod:manage"),
	});

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

	if (isLoading)
		return (
			<div className="p-8 text-center text-muted-foreground animate-pulse font-medium tracking-tight">
				Loading pods...
			</div>
		);

	return (
		<ResourcePageLayout
			title="Pods"
			subtitle="The smallest deployable units of computing"
			description="Pods are the smallest deployable units of computing that you can create and manage in Kubernetes. A Pod is a group of one or more containers, with shared storage and network resources, and a specification for how to run the containers."
			helpLink="https://kubernetes.io/docs/concepts/workloads/pods/"
			canCreate={can("pod:create")}
			createLink="/dashboard/cluster/$id/pods/create"
			createLabel="Create Pod"
		>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead className="px-6 py-4">Name</TableHead>
						<TableHead className="py-4">Namespace</TableHead>
						<TableHead className="py-4">Status</TableHead>
						<TableHead className="py-4">Image</TableHead>
						<TableHead className="py-4 text-center">CPU / MEM</TableHead>
						<TableHead className="text-right px-6 py-4">Actions</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{pods?.map((pod) => (
						<TableRow key={pod.id} className="group">
							<TableCell className="font-medium px-6 py-4">
								<div className="flex items-center gap-2">
									<Box className="h-4 w-4 text-primary/70" />
									<span className="font-semibold">{pod.name}</span>
								</div>
							</TableCell>
							<TableCell>{pod.namespace}</TableCell>
							<TableCell>
								<span
									className={`px-2.5 py-1 rounded-full text-[10px] font-bold ring-1 ring-inset ${
										pod.status === "Running"
											? "bg-green-100 text-green-700 ring-green-600/20"
											: pod.status === "Pending"
												? "bg-yellow-100 text-yellow-700 ring-yellow-600/20"
												: "bg-red-100 text-red-700 ring-red-600/20"
									}`}
								>
									{pod.status || "Running"}
								</span>
							</TableCell>
							<TableCell
								className="max-w-[200px] truncate font-mono text-[11px] text-muted-foreground"
								title={pod.dockerImage}
							>
								{pod.dockerImage}
							</TableCell>
							<TableCell className="text-center font-bold text-foreground/80">
								{pod.cpuRequest}m / {pod.memoryRequest}Mi
							</TableCell>
							<TableCell className="text-right px-6">
								<div className="flex justify-end gap-1">
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
											className="h-8 w-8"
											disabled={!can("pod:read") && !can("pod:manage")}
										>
											<Settings className="h-4 w-4" />
										</Button>
									</Link>
								</div>
							</TableCell>
						</TableRow>
					))}
					{(!pods || pods.length === 0) && (
						<TableRow>
							<TableCell
								colSpan={6}
								className="text-center py-24 text-muted-foreground/50"
							>
								<div className="flex flex-col items-center justify-center space-y-4">
									<Box className="h-12 w-12 opacity-20" />
									<p className="text-xl font-semibold text-foreground/70">
										No pods found
									</p>
								</div>
							</TableCell>
						</TableRow>
					)}
				</TableBody>
			</Table>
		</ResourcePageLayout>
	);
}
