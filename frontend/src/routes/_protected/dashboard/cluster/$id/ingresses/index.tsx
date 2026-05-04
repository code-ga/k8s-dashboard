import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { Settings, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CreateIngressDialog } from "@/components/ingress/create-dialog";
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
import type { databaseTypes, SchemaStatic } from "@/lib/api";
import { api, getEdenErrorMessage } from "@/lib/api";

export const Route = createFileRoute(
	"/_protected/dashboard/cluster/$id/ingresses/",
)({
	component: ClusterIngresses,
});

type Ingress = SchemaStatic<databaseTypes.databaseTypes["k8sIngresses"]>;

function ClusterIngresses() {
	const { id } = useParams({
		from: "/_protected/dashboard/cluster/$id/ingresses/",
	});
	const { can, isLoading: isLoadingPermissions } = usePermissions();
	const queryClient = useQueryClient();

	const { data: ingresses, isLoading } = useQuery({
		queryKey: ["ingresses", id],
		queryFn: async () => {
			const res = can("ingress:manage")
				? await api.api.ingresses({ clusterId: id }).all.get()
				: await api.api.ingresses({ clusterId: id }).get();
			if (res.error) throw res.error;
			if (!res.data.data)
				throw new Error(res.data.message || "Failed to fetch ingresses");
			return res.data.data as Ingress[];
		},
		enabled: can("ingress:read") || can("ingress:manage"),
	});

	const deleteMutation = useMutation({
		mutationFn: async (ingressId: number) => {
			const res = await api.api
				.ingresses({ clusterId: id })({
					id: String(ingressId),
				})
				.delete();
			if (res.error) throw res.error;
			return res.data;
		},
		onSuccess: () => {
			toast.success("Ingress deleted successfully");
			queryClient.invalidateQueries({ queryKey: ["ingresses", id] });
			queryClient.invalidateQueries({ queryKey: ["services", id] });
		},
		onError: (error: any) => {
			toast.error(getEdenErrorMessage(error));
		},
	});

	if (!can("ingress:read") && !can("ingress:manage") && !isLoadingPermissions) {
		return (
			<div className="flex items-center justify-center py-12">
				<div className="text-center">
					<h2 className="text-xl font-semibold text-muted-foreground">
						Access Denied
					</h2>
					<p className="text-sm text-muted-foreground mt-2">
						You don't have permission to view ingresses.
					</p>
				</div>
			</div>
		);
	}

	if (isLoading)
		return (
			<div className="p-8 text-center text-muted-foreground animate-pulse font-medium tracking-tight">
				Loading ingresses...
			</div>
		);

	return (
		<ResourcePageLayout
			title="Ingresses"
			subtitle="External access management"
			description="An API object that manages external access to the services in a cluster, typically HTTP. Ingress may provide load balancing, SSL termination and name-based virtual hosting."
			helpLink="https://kubernetes.io/docs/concepts/services-networking/ingress/"
		>
			<div className="p-4 border-b bg-muted/20 flex justify-end">
				{can("ingress:create") && <CreateIngressDialog clusterId={id} />}
			</div>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead className="px-6 py-4">Protocol</TableHead>
						<TableHead className="py-4">Domain / Port</TableHead>
						<TableHead className="py-4">Service</TableHead>
						<TableHead className="py-4">Namespace</TableHead>
						<TableHead className="text-right px-6 py-4">Actions</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{ingresses?.map((ing) => (
						<TableRow key={ing.id} className="group">
							<TableCell className="font-medium px-6 py-4">
								<div className="flex items-center gap-2">
									<ShieldCheck className="h-4 w-4 text-primary/70" />
									<Link
										to="/dashboard/cluster/$id/ingresses/$ingressId"
										params={{ id, ingressId: ing.id.toString() }}
										className="font-semibold hover:underline"
									>
										{ing.protocol?.toUpperCase()}
									</Link>
									{ing.tls && (
										<span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700">
											TLS
										</span>
									)}
								</div>
							</TableCell>
							<TableCell>
								{ing.protocol === "http" ? (
									<span className="font-mono text-xs">{ing.domain}</span>
								) : (
									<span className="font-mono text-xs text-muted-foreground">
										Port: {ing.port}
									</span>
								)}
							</TableCell>
							<TableCell>
								<Link
									to="/dashboard/cluster/$id/services"
									search={{}}
									params={{ id }}
									className="text-sm hover:underline"
								>
									{ing.serviceName}
								</Link>
							</TableCell>
							<TableCell className="text-sm text-muted-foreground">
								{ing.namespace}
							</TableCell>
							<TableCell className="text-right px-6">
								<div className="flex justify-end gap-1">
									<Link
										to="/dashboard/cluster/$id/ingresses/$ingressId"
										params={{ id, ingressId: ing.id.toString() }}
									>
										<Button
											variant="ghost"
											size="sm"
											className="h-8 w-8"
											disabled={!can("ingress:read") && !can("ingress:manage")}
										>
											<Settings className="h-4 w-4" />
										</Button>
									</Link>
									{(can("ingress:delete") || can("ingress:manage")) && (
										<Button
											variant="ghost"
											size="icon"
											className="h-8 w-8 text-muted-foreground hover:text-destructive transition-colors"
											onClick={() => {
												if (
													confirm("Are you sure you want to delete this ingress?")
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
								className="text-center py-24 text-muted-foreground/50"
							>
								<div className="flex flex-col items-center justify-center space-y-4">
									<ShieldCheck className="h-12 w-12 opacity-20" />
									<div className="space-y-1">
										<p className="text-xl font-semibold text-foreground/70">
											No Ingresses Found
										</p>
										<p className="max-w-[250px] mx-auto text-sm opacity-60">
											Go to Services to expose your application to the internet.
										</p>
									</div>
								</div>
							</TableCell>
						</TableRow>
					)}
				</TableBody>
			</Table>
		</ResourcePageLayout>
	);
}
