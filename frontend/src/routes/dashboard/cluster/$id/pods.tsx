import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent
} from "@/components/ui/card";
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
import { ArrowLeft, Box } from "lucide-react";

export const Route = createFileRoute("/dashboard/cluster/$id/pods")({
	component: ClusterPods,
});

function ClusterPods() {
	const { id } = useParams({ from: "/dashboard/cluster/$id/pods" });
	// const queryClient = useQueryClient();

	const { data: pods, isLoading } = useQuery({
		queryKey: ["pods", id],
		queryFn: async () => {
			// Pod route prefix is /:clusterId/pods
			// api treat params as object
			// The route definition in pod.ts is `prefix: "/:clusterId/pods"`
			// Elysia Eden might map this as api[{clusterId}].pods.index.get() ??
			// Let's verify how dynamic prefix is handled in Eden treaty.
			// Usually it's api.param(clusterId).pods.get() if using standard eden?
			// But treaty uses object access.
			// It might be `api[id].pods.index.get()` ? No keys are strings.
			// Wait, if prefix has param, it might not work well with treaty auto-completion if not specific.
			// Let's assume standard `api({ clusterId: id }).pods.index.get()` or similar.
			// Actually `pod.ts` prefix is `/pops/:clusterId`.
			// Let's try `api[id].pods.index.get()` pattern if id is dynamic?
			// The safe fallback is raw fetch if type safety is tricky.
			// But let's try `api[id].pods.get()` (if index is default).

			// Checking `pod.ts`:
			// `export const podRoute = new Elysia({ prefix: "/pops/:clusterId" })`
			// Treaty: api[':clusterId'].pods...
			// Using `api({ clusterId: id }).pods.index.get()` is the standard treaty way for params.

			const res = await api.api.pods({ clusterId: id }).get();
			if (res.error) throw res.error;
			if (!res.data.data) throw new Error(res.data.message || "Failed to fetch pods");
			return res.data.data;
		},
	});

	// Start/Delete Pod Mutation (if available) - Pod route only has GET currently.

	if (isLoading) return <div>Loading pods...</div>;

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-4">
				<Link to={`/dashboard/cluster/$id`} params={{ id }}>
					<Button variant="ghost" size="icon">
						<ArrowLeft className="h-4 w-4" />
					</Button>
				</Link>
				<div>
					<h2 className="text-3xl font-bold tracking-tight">Pods</h2>
					<p className="text-muted-foreground">List of pods in this cluster</p>
				</div>
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
									<TableCell>Running</TableCell>{" "}
									{/* No status in schema yet? */}
									<TableCell
										className="max-w-[200px] truncate"
										title={pod.dockerImage}
									>
										{pod.dockerImage}
									</TableCell>
									<TableCell>
										{pod.cpuRequest}m / {pod.memoryRequest}Mi
									</TableCell>
								</TableRow>
							))}
							{(!pods || pods.length === 0) && (
								<TableRow>
									<TableCell colSpan={5} className="text-center py-4">
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
