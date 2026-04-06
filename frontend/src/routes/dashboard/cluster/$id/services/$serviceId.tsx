import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	useNavigate,
	useParams,
} from "@tanstack/react-router";
import { ArrowLeft, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
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
import { api, getEdenErrorMessage } from "@/lib/api";

export const Route = createFileRoute(
	"/dashboard/cluster/$id/services/$serviceId",
)({
	component: ServiceDetailPage,
});

function ServiceDetailPage() {
	const { id, serviceId } = useParams({
		from: "/dashboard/cluster/$id/services/$serviceId",
	});
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

	const { data: service, isLoading } = useQuery({
		queryKey: ["service", id, serviceId],
		queryFn: async () => {
			const res = await api.api
				.services({ clusterId: id })({ id: serviceId })
				.get();
			if (res.error) throw res.error;
			if (!res.data.data)
				throw new Error(res.data.message || "Failed to fetch service");
			return res.data.data;
		},
	});

	// Get cluster domain from cluster data
	const { data: cluster } = useQuery({
		queryKey: ["cluster", id],
		queryFn: async () => {
			const res = await api.api.cluster({ id }).get();
			if (res.error) throw res.error;
			if (!res.data.data)
				throw new Error(res.data.message || "Failed to fetch cluster");
			return res.data.data;
		},
	});

	const deleteMutation = useMutation({
		mutationFn: async () => {
			const res = await api.api
				.services({ clusterId: id })({ id: serviceId })
				.delete();
			if (res.error) {
				throw new Error(getEdenErrorMessage(res.error));
			}
			return res.data;
		},
		onSuccess: () => {
			toast.success("Service deleted successfully");
			queryClient.invalidateQueries({ queryKey: ["services", id] });
			navigate({
				to: `/dashboard/cluster/$id/services`,
				params: { id },
			});
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});

	if (isLoading) return <div>Loading service details...</div>;
	if (!service) return <div>Service not found</div>;
	const serviceDomain = `${service.name}.${service.namespace}.svc.${cluster?.internalClusterDomain || "cluster.local"}`;

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-4">
					<Link to={`/dashboard/cluster/$id/services`} params={{ id }}>
						<Button variant="ghost" size="icon">
							<ArrowLeft className="h-4 w-4" />
						</Button>
					</Link>
					<div>
						<h2 className="text-3xl font-bold tracking-tight">
							{service.name}
						</h2>
						<p className="text-muted-foreground">
							Service details and configuration
						</p>
					</div>
				</div>
				<Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
					<Trash2 className="h-4 w-4 mr-2" />
					Delete Service
				</Button>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
				<Card>
					<CardHeader>
						<CardTitle>Metadata</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="grid grid-cols-2 gap-2">
							<div className="text-sm font-medium text-muted-foreground">
								Namespace
							</div>
							<div className="text-sm">{service.namespace}</div>

							<div className="text-sm font-medium text-muted-foreground">
								Type
							</div>
							<div className="text-sm">{service.type || "ClusterIP"}</div>

							<div className="text-sm font-medium text-muted-foreground">
								Cluster IP
							</div>
							<div className="text-sm font-mono">{service.clusterIp}</div>

							<div className="text-sm font-medium text-muted-foreground">
								Service Domain
							</div>
							<div className="text-sm font-mono">{serviceDomain}</div>

							<div className="text-sm font-medium text-muted-foreground">
								Created At
							</div>
							<div className="text-sm">
								{new Date(service.createdAt).toLocaleString()}
							</div>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Selector</CardTitle>
					</CardHeader>
					<CardContent>
						{service.selector ? (
							<div className="space-y-2">
								{Object.entries(
									typeof service.selector === "string"
										? JSON.parse(service.selector)
										: service.selector,
								).map(([key, value]) => (
									<div
										key={key}
										className="bg-muted px-2 py-1 rounded text-xs font-mono inline-block mr-2"
									>
										{key}: {String(value)}
									</div>
								))}
							</div>
						) : (
							<div className="text-sm text-muted-foreground">No selector</div>
						)}
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Ports</CardTitle>
				</CardHeader>
				<CardContent className="p-0">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Name</TableHead>
								<TableHead>Protocol</TableHead>
								<TableHead>Port</TableHead>
								<TableHead>Target Port</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{(service.ports as any)?.data?.map((port: any, _i: any) => (
								<TableRow key={port.name + service.id}>
									<TableCell>{port.name || "-"}</TableCell>
									<TableCell>{port.protocol}</TableCell>
									<TableCell>{port.port}</TableCell>
									<TableCell>{port.targetPort}</TableCell>
								</TableRow>
							))}
							{(!service.ports ||
								!service.ports?.data ||
								service.ports.data.length === 0) && (
								<TableRow>
									<TableCell colSpan={4} className="text-center py-4">
										No ports defined
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Ingresses (Exposure)</CardTitle>
				</CardHeader>
				<CardContent className="p-0">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Ingress Name</TableHead>
								<TableHead>Protocol</TableHead>
								<TableHead>Exposure</TableHead>
								<TableHead className="text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{service.ingresses && service.ingresses.length > 0 ? (
								service.ingresses.map((ing) => (
									<TableRow key={ing.id}>
										<TableCell className="font-medium">
											<div className="flex items-center gap-2">
												<ShieldCheck className="h-4 w-4 text-green-500" />
												<Link
													to="/dashboard/cluster/$id/ingresses/$ingressId"
													params={{
														id,
														ingressId: ing.id.toString(),
													}}
													className="hover:underline"
												>
													{ing.name}
												</Link>
											</div>
										</TableCell>
										<TableCell>{ing.protocol?.toUpperCase()}</TableCell>
										<TableCell>
											{ing.protocol === "http" ? (
												<span className="font-mono text-xs">{ing.domain}</span>
											) : (
												<span className="font-mono text-xs">
													Port: {ing.port}
												</span>
											)}
										</TableCell>
										<TableCell className="text-right">
											<Link
												to="/dashboard/cluster/$id/ingresses/$ingressId"
												params={{
													id,
													ingressId: ing.id.toString(),
												}}
											>
												<Button variant="ghost" size="sm">
													View Details
												</Button>
											</Link>
										</TableCell>
									</TableRow>
								))
							) : (
								<TableRow>
									<TableCell
										colSpan={4}
										className="text-center py-4 text-muted-foreground"
									>
										<div className="flex flex-col items-center gap-2">
											<ShieldAlert className="h-4 w-4" />
											This service is not exposed via Ingress.
										</div>
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				</CardContent>
			</Card>

			<Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete Service</DialogTitle>
						<DialogDescription>
							Are you sure you want to delete the service "{service.name}"? This
							action cannot be undone and may affect applications that depend on
							this service.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setDeleteDialogOpen(false)}
						>
							Cancel
						</Button>
						<Button
							variant="destructive"
							onClick={() => {
								setDeleteDialogOpen(false);
								deleteMutation.mutate();
							}}
							disabled={deleteMutation.isPending}
						>
							{deleteMutation.isPending ? "Deleting..." : "Delete Service"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
