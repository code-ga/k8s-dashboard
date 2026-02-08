import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	useNavigate,
	useParams,
} from "@tanstack/react-router";
import { ArrowLeft, Network, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute(
	"/dashboard/cluster/$id/ingresses/$ingressId",
)({
	component: IngressDetailPage,
});

function IngressDetailPage() {
	const { id, ingressId } = useParams({
		from: "/dashboard/cluster/$id/ingresses/$ingressId",
	});
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	const { data: ingress, isLoading } = useQuery({
		queryKey: ["ingress", id, ingressId],
		queryFn: async () => {
			const res = await (api.api.ingresses as any)({ clusterId: id })({
				id: ingressId,
			}).get();
			if (res.error) throw res.error;
			if (!res.data.data)
				throw new Error(res.data.message || "Failed to fetch ingress");
			return res.data.data;
		},
	});

	const deleteMutation = useMutation({
		mutationFn: async () => {
			const res = await (api.api.ingresses as any)({ clusterId: id })({
				id: ingressId,
			}).delete();
			if (res.error) throw res.error;
			return res.data;
		},
		onSuccess: () => {
			toast.success("Ingress deleted successfully");
			queryClient.invalidateQueries({ queryKey: ["ingresses", id] });
			queryClient.invalidateQueries({ queryKey: ["services", id] });
			navigate({ to: `/dashboard/cluster/$id/ingresses`, params: { id } });
		},
		onError: (error: any) => {
			toast.error(error.message || "Failed to delete ingress");
		},
	});

	if (isLoading) return <div>Loading ingress details...</div>;
	if (!ingress) return <div>Ingress not found</div>;

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-4">
					<Link to={`/dashboard/cluster/$id/ingresses`} params={{ id }}>
						<Button variant="ghost" size="icon">
							<ArrowLeft className="h-4 w-4" />
						</Button>
					</Link>
					<div>
						<h2 className="text-3xl font-bold tracking-tight">
							{ingress.name}
						</h2>
						<p className="text-muted-foreground">
							Ingress details and configuration
						</p>
					</div>
				</div>
				<Button
					variant="destructive"
					onClick={() => {
						if (confirm("Are you sure you want to delete this ingress?")) {
							deleteMutation.mutate();
						}
					}}
					disabled={deleteMutation.isPending}
				>
					<Trash2 className="mr-2 h-4 w-4" /> Delete Ingress
				</Button>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
				<Card>
					<CardHeader>
						<CardTitle>Configuration</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="grid grid-cols-2 gap-2">
							<div className="text-sm font-medium text-muted-foreground">
								Namespace
							</div>
							<div className="text-sm">{ingress.namespace}</div>

							<div className="text-sm font-medium text-muted-foreground">
								Protocol
							</div>
							<div className="text-sm bg-muted inline-block px-2 rounded">
								{ingress.protocol?.toUpperCase()}
							</div>

							<div className="text-sm font-medium text-muted-foreground">
								Domain
							</div>
							<div className="text-sm font-mono">{ingress.domain || "-"}</div>

							<div className="text-sm font-medium text-muted-foreground">
								External Port
							</div>
							<div className="text-sm">{ingress.port}</div>

							<div className="text-sm font-medium text-muted-foreground">
								Created At
							</div>
							<div className="text-sm">
								{new Date(ingress.createdAt).toLocaleString()}
							</div>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Target Service</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="flex items-center justify-between p-4 border rounded-lg">
							<div className="flex items-center gap-3">
								<Network className="h-5 w-5 text-blue-500" />
								<div>
									<div className="font-medium">{ingress.serviceName}</div>
									<div className="text-xs text-muted-foreground">Service</div>
								</div>
							</div>
							<Link
								to="/dashboard/cluster/$id/services/$serviceId"
								params={{
									id,
									serviceId: ingress.serviceId
										? ingress.serviceId.toString()
										: ingress.serviceName, // Fallback if ID is missing (though backend sends it)
								}}
							>
								<Button variant="outline" size="sm">
									View Service
								</Button>
							</Link>
						</div>
						{!ingress.serviceId && (
							<p className="mt-2 text-xs text-yellow-600">
								Note: Service ID connection is missing, linking by name might be
								imprecise.
							</p>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
