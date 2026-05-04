import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import {
	Eye,
	Network,
	ShieldAlert,
	ShieldCheck,
	Trash2,
	Unplug,
} from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { ResourcePageLayout } from "@/components/shared/resource-page-layout";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
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
	"/_protected/dashboard/cluster/$id/services/",
)({
	component: ClusterServices,
});

type Service = SchemaStatic<databaseTypes.databaseTypes["k8sServices"]> & {
	ingresses?: SchemaStatic<databaseTypes.databaseTypes["k8sIngresses"]>[];
};

function ExposureDialog({
	service,
	clusterId,
}: {
	service: Service;
	clusterId: string;
}) {
	const [open, setOpen] = useState(false);
	const queryClient = useQueryClient();
	const { can } = usePermissions();

	// Find if there is an existing ingress for this service
	const ingress = service.ingresses?.[0];

	const form = useForm({
		defaultValues: {
			protocol: (ingress?.protocol as "http" | "tcp" | "udp") || "http",
			domain: ingress?.domain || "",
			internalPort:
				ingress?.internalPort || service.ports?.data?.[0]?.port || 80,
			tls: ingress?.tls ?? true,
		},
	});

	const exposeMutation = useMutation({
		mutationFn: async (values: any) => {
			const res = await api.api.ingresses({ clusterId }).expose.post({
				serviceName: service.name,
				namespace: service.namespace,
				protocol: values.protocol,
				internalPort: values.internalPort,
				domain: values.protocol === "http" ? values.domain : undefined,
				tls: values.protocol === "http" ? values.tls : undefined,
			});
			if (res.error) throw res.error;
			return res.data;
		},
		onSuccess: () => {
			toast.success("Service exposed successfully");
			queryClient.invalidateQueries({ queryKey: ["services", clusterId] });
			setOpen(false);
		},
		onError: (error: any) => {
			toast.error(getEdenErrorMessage(error));
		},
	});

	const deExposeMutation = useMutation({
		mutationFn: async () => {
			const ingress = service.ingresses?.find(
				(i: any) => i.protocol === form.getValues().protocol,
			);
			if (!ingress) throw new Error("No matching ingress found to delete");

			const res = await api.api
				.ingresses({ clusterId })({
					id: String(ingress.id),
				})
				.delete();
			if (res.error) throw res.error;
			return res.data;
		},
		onSuccess: () => {
			toast.success("Service de-exposed successfully");
			queryClient.invalidateQueries({ queryKey: ["services", clusterId] });
			setOpen(false);
		},
		onError: (error: any) => {
			toast.error(getEdenErrorMessage(error));
		},
	});

	const protocol = form.watch("protocol");

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button
					variant={ingress ? "outline" : "default"}
					size="sm"
					className="h-8 gap-2"
				>
					{ingress ? (
						<>
							<ShieldCheck className="h-4 w-4 text-green-500" />
							Manage Exposure
						</>
					) : (
						<>
							<Network className="h-4 w-4" />
							Expose
						</>
					)}
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Expose Service: {service.name}</DialogTitle>
					<DialogDescription>
						Configure how this service is accessible from outside the cluster.
					</DialogDescription>
				</DialogHeader>

				<Form {...form}>
					<form
						onSubmit={form.handleSubmit((v) => exposeMutation.mutate(v))}
						className="space-y-4"
					>
						<FormField
							control={form.control}
							name="protocol"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Protocol</FormLabel>
									<Select
										onValueChange={field.onChange}
										defaultValue={field.value}
									>
										<FormControl>
											<SelectTrigger>
												<SelectValue placeholder="Select protocol" />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											<SelectItem value="http">HTTP (Layer 7)</SelectItem>
											<SelectItem value="tcp">TCP (Layer 4)</SelectItem>
											<SelectItem value="udp">UDP (Layer 4)</SelectItem>
										</SelectContent>
									</Select>
									<FormMessage />
								</FormItem>
							)}
						/>

						{protocol === "http" && (
							<>
								<FormField
									control={form.control}
									name="domain"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Domain Name</FormLabel>
											<FormControl>
												<Input placeholder="myapp.example.com" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="tls"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
											<div className="space-y-0.5">
												<FormLabel className="text-base">Enable TLS</FormLabel>
												<FormDescription>
													Use Let's Encrypt for automatic TLS certificate
												</FormDescription>
											</div>
											<FormControl>
												<Switch
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
											</FormControl>
										</FormItem>
									)}
								/>
							</>
						)}

						<FormField
							control={form.control}
							name="internalPort"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Internal Port</FormLabel>
									<FormControl>
										<Input
											type="number"
											{...field}
											onChange={(e) => field.onChange(Number(e.target.value))}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<DialogFooter className="gap-2">
							{ingress && (can("ingress:delete") || can("ingress:manage")) && (
								<Button
									type="button"
									variant="destructive"
									className="gap-2"
									onClick={() => deExposeMutation.mutate()}
									disabled={deExposeMutation.isPending}
								>
									<Unplug className="h-4 w-4" />
									De-expose
								</Button>
							)}
							{(can("ingress:create") ||
								can("ingress:manage") ||
								(ingress &&
									(can("ingress:update") || can("ingress:manage")))) && (
								<Button type="submit" disabled={exposeMutation.isPending}>
									{ingress ? "Update" : "Expose"}
								</Button>
							)}
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}

function ClusterServices() {
	const { id } = useParams({
		from: "/_protected/dashboard/cluster/$id/services/",
	});
	const { can, isLoading: isLoadingPermissions } = usePermissions();
	const queryClient = useQueryClient();

	const { data: services, isLoading } = useQuery({
		queryKey: ["services", id],
		queryFn: async () => {
			const res = can("service:manage")
				? await api.api.services({ clusterId: id }).all.get()
				: await api.api.services({ clusterId: id }).get();
			if (res.error) throw res.error;
			if (!res.data.data)
				throw new Error(res.data.message || "Failed to fetch services");
			return res.data.data;
		},
		enabled: can("service:read") || can("service:manage"),
	});

	const deleteMutation = useMutation({
		mutationFn: async (serviceId: number) => {
			const res = await api.api
				.services({ clusterId: id })({ id: String(serviceId) })
				.delete();
			if (res.error) throw res.error;
			return res.data;
		},
		onSuccess: () => {
			toast.success("Service deleted successfully");
			queryClient.invalidateQueries({ queryKey: ["services", id] });
		},
		onError: (error: any) => {
			toast.error(getEdenErrorMessage(error));
		},
	});

	if (!can("service:read") && !can("service:manage") && !isLoadingPermissions) {
		return (
			<div className="flex items-center justify-center py-12">
				<div className="text-center">
					<h2 className="text-xl font-semibold text-muted-foreground">
						Access Denied
					</h2>
					<p className="text-sm text-muted-foreground mt-2">
						You don't have permission to view services.
					</p>
				</div>
			</div>
		);
	}

	if (isLoading)
		return (
			<div className="p-8 text-center text-muted-foreground animate-pulse font-medium tracking-tight">
				Loading services...
			</div>
		);

	return (
		<ResourcePageLayout
			title="Services"
			subtitle="Abstract way to expose applications"
			description="An abstract way to expose an application running on a set of Pods as a network service. With Kubernetes you don't need to modify your application to use an unfamiliar service discovery mechanism."
			helpLink="https://kubernetes.io/docs/concepts/services-networking/service/"
			canCreate={can("service:create")}
			createLink="/dashboard/cluster/$id/services/create"
			createLabel="Create Service"
		>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead className="px-6 py-4">Name</TableHead>
						<TableHead className="py-4">Namespace</TableHead>
						<TableHead className="py-4">Type</TableHead>
						<TableHead className="py-4">Ports</TableHead>
						<TableHead className="py-4">Exposure</TableHead>
						<TableHead className="text-right px-6 py-4">Actions</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{services?.map((svc) => (
						<TableRow key={svc.id} className="group">
							<TableCell className="font-medium px-6 py-4">
								<div className="flex items-center gap-2">
									<Network className="h-4 w-4 text-primary/70" />
									<Link
										to="/dashboard/cluster/$id/services/$serviceId"
										params={{ id, serviceId: svc.id.toString() }}
										className="font-semibold hover:underline"
									>
										{svc.name}
									</Link>
								</div>
							</TableCell>
							<TableCell>{svc.namespace}</TableCell>
							<TableCell>{svc.type || "ClusterIP"}</TableCell>
							<TableCell>
								<div className="flex flex-col gap-1">
									{svc.ports?.data?.map((p) => (
										<div key={p.port} className="text-xs text-muted-foreground">
											{p.port} → {p.targetPort} ({p.protocol})
										</div>
									))}
								</div>
							</TableCell>
							<TableCell>
								{svc.ingresses && svc.ingresses.length > 0 ? (
									<div className="flex flex-col gap-1">
										{svc.ingresses.map((ing) => (
											<div
												key={ing.id}
												className="flex items-center gap-2 text-xs text-green-600 font-medium whitespace-nowrap"
											>
												<ShieldCheck className="h-3 w-3" />
												{ing.protocol?.toUpperCase()}
												{ing.port ? `:${ing.port}` : ""}
												{ing.domain ? ` (${ing.domain})` : ""}
												{ing.tls && ing.protocol === "http" && (
													<span className="inline-flex items-center px-1 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-800">
														TLS
													</span>
												)}
											</div>
										))}
									</div>
								) : (
									<div className="flex items-center gap-2 text-xs text-muted-foreground whitespace-nowrap">
										<ShieldAlert className="h-3 w-3" />
										Internal Only
									</div>
								)}
							</TableCell>
							<TableCell className="text-right px-6">
								<div className="flex justify-end gap-1">
									<ExposureDialog service={svc} clusterId={id} />
									<Link
										to="/dashboard/cluster/$id/services/$serviceId"
										params={{ id, serviceId: svc.id.toString() }}
									>
										<Button
											variant="ghost"
											size="sm"
											className="h-8 w-8"
											disabled={!can("service:read") && !can("service:manage")}
										>
											<Eye className="h-4 w-4" />
										</Button>
									</Link>
									{(can("service:delete") || can("service:manage")) && (
										<Button
											variant="ghost"
											size="icon"
											className="h-8 w-8 text-muted-foreground hover:text-destructive transition-colors"
											onClick={() => {
												if (
													confirm(
														"Are you sure you want to delete this service? This will break any ingress routes pointing to it.",
													)
												) {
													deleteMutation.mutate(svc.id);
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
					{(!services || services.length === 0) && (
						<TableRow>
							<TableCell
								colSpan={6}
								className="text-center py-24 text-muted-foreground/50"
							>
								<div className="flex flex-col items-center justify-center space-y-4">
									<Network className="h-12 w-12 opacity-20" />
									<p className="text-xl font-semibold text-foreground/70">
										No services found
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
