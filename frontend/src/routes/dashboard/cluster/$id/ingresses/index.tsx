import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, Settings, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CreateIngressDialog } from "@/components/ingress/create-dialog";
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
import type { databaseTypes, SchemaStatic } from "@/lib/api";
import { api } from "@/lib/api";
import { usePermissions } from "@/hooks/use-permissions";

export const Route = createFileRoute("/dashboard/cluster/$id/ingresses/")({
	component: ClusterIngresses,
});

type Ingress = SchemaStatic<databaseTypes.databaseTypes["k8sIngresses"]>;

function ClusterIngresses() {
	const { id } = useParams({ from: "/dashboard/cluster/$id/ingresses/" });
	const { can } = usePermissions();
	const queryClient = useQueryClient();

	const { data: ingresses, isLoading } = useQuery({
		queryKey: ["ingresses", id],
		queryFn: async () => {
			const res = await (api.api.ingresses as any)({ clusterId: id }).get();
			if (res.error) throw res.error;
			if (!res.data.data)
				throw new Error(res.data.message || "Failed to fetch ingresses");
			return res.data.data as Ingress[];
		},
	});

	const deleteMutation = useMutation({
		mutationFn: async (ingressId: number) => {
			const res = await (api.api.ingresses as any)({ clusterId: id })({
				id: String(ingressId),
			}).delete();
			if (res.error) throw res.error;
			return res.data;
		},
		onSuccess: () => {
			toast.success("Ingress deleted successfully");
			queryClient.invalidateQueries({ queryKey: ["ingresses", id] });
			queryClient.invalidateQueries({ queryKey: ["services", id] });
		},
		onError: (error: any) => {
			toast.error(error.message || "Failed to delete ingress");
		},
	});

	if (isLoading) return <div>Loading ingresses...</div>;

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-4">
				<Link to={`/dashboard/cluster/$id`} params={{ id }}>
					<Button variant="ghost" size="icon">
						<ArrowLeft className="h-4 w-4" />
					</Button>
				</Link>
				<div>
					<h2 className="text-3xl font-bold tracking-tight">Ingresses</h2>
					<p className="text-muted-foreground">
						Manage external exposure for your services
					</p>
				</div>
			</div>
			<div className="flex justify-end">
				{can("ingress:create") && <CreateIngressDialog clusterId={id} />}
			</div>

			<Card>
				<CardContent className="p-0">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Protocol</TableHead>
								<TableHead>Domain / Port</TableHead>
								<TableHead>Service</TableHead>
								<TableHead>Namespace</TableHead>
								<TableHead className="text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{ingresses?.map((ing) => (
								<TableRow key={ing.id}>
									<TableCell className="font-medium">
										<div className="flex items-center gap-2">
											<ShieldCheck className="h-4 w-4 text-green-500" />
											<Link
												to="/dashboard/cluster/$id/ingresses/$ingressId"
												params={{ id, ingressId: ing.id.toString() }}
												className="hover:underline"
											>
												{ing.protocol?.toUpperCase()}
											</Link>
										</div>
									</TableCell>
									<TableCell>
										{ing.protocol === "http" ? (
											<span className="font-mono text-xs">{ing.domain}</span>
										) : (
											<span className="font-mono text-xs">
												Port: {ing.port}
											</span>
										)}
									</TableCell>
									<TableCell>
										<Link
											to="/dashboard/cluster/$id/services" // We don't have direct service ID here on the ingress object easily unless we fetch it or it's in the object. DB schema has serviceId.
											// Ideally we link to service detail if we have serviceId.
											// The ingress object has `serviceId`.
											search={{}} // Clear search params if any?
											params={{ id }}
										>
											<span className="hover:underline cursor-pointer">
												{ing.serviceName}
											</span>
										</Link>
									</TableCell>
									<TableCell>{ing.namespace}</TableCell>
									<TableCell className="text-right">
										<div className="flex justify-end gap-2">
											<Link
												to="/dashboard/cluster/$id/ingresses/$ingressId"
												params={{ id, ingressId: ing.id.toString() }}
											>
												<Button
													variant="ghost"
													size="icon"
													disabled={!can("ingress:read") && !can("ingress:manage")}
												>
													<Settings className="h-4 w-4" />
												</Button>
											</Link>
											{(can("ingress:delete") || can("ingress:manage")) && (
												<Button
													variant="ghost"
													size="icon"
													className="text-destructive hover:text-destructive hover:bg-destructive/10"
													onClick={() => {
														if (
															confirm(
																"Are you sure you want to delete this ingress?",
															)
														) {
															deleteMutation.mutate(ing.id);
														}
													}}
													disabled={deleteMutation.isPending}
												>
													<Trash2 className="h-4 w-4" />
												</Button>
											)}
										</div>
									</TableCell>
								</TableRow>
							))}
							{(!ingresses || ingresses.length === 0) && (
								<TableRow>
									<TableCell
										colSpan={5}
										className="text-center py-4 text-muted-foreground"
									>
										No service exposures found. Go to Services to expose one.
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
