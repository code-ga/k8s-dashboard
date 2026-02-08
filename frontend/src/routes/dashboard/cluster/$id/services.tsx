import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import {
	ArrowLeft,
	Network,
	ShieldAlert,
	ShieldCheck,
	Unplug,
} from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { databaseTypes, SchemaStatic } from "@/lib/api";
import { CreateServiceDialog } from "@/components/service/create-dialog";
import { Trash2 } from "lucide-react";

export const Route = createFileRoute("/dashboard/cluster/$id/services")({
	component: ClusterServices,
});

type Service = SchemaStatic<databaseTypes.databaseTypes["k8sServices"]>;

function ExposureDialog({
	service,
	clusterId,
}: {
	service: Service;
	clusterId: string;
}) {
	const [open, setOpen] = useState(false);
	const queryClient = useQueryClient();

	// Find if there is an existing ingress for this service
	const ingress = (service as any).ingresses?.[0];

	const form = useForm({
		defaultValues: {
			protocol: (ingress?.protocol as "http" | "tcp" | "udp") || "http",
			domain: ingress?.domain || "",
			internalPort:
				ingress?.internalPort || (service.ports as any[])?.[0]?.port || 80,
		},
	});

	const exposeMutation = useMutation({
		mutationFn: async (values: any) => {
			const res = await (api.api.ingresses as any)({ clusterId }).expose.post({
				serviceName: service.name,
				namespace: service.namespace,
				protocol: values.protocol,
				internalPort: values.internalPort,
				domain: values.protocol === "http" ? values.domain : undefined,
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
			toast.error(error.message || "Failed to expose service");
		},
	});

	const deExposeMutation = useMutation({
		mutationFn: async () => {
			// Find the ingress associated with this service and port
			const ingress = (service as any).ingresses?.find(
				(i: any) => i.protocol === form.getValues().protocol,
			);
			if (!ingress) throw new Error("No matching ingress found to delete");

			const res = await (api.api.ingresses as any)({ clusterId })({
				id: String(ingress.id),
			}).delete();
			if (res.error) throw res.error;
			return res.data;
		},
		onSuccess: () => {
			toast.success("Service de-exposed successfully");
			queryClient.invalidateQueries({ queryKey: ["services", clusterId] });
			setOpen(false);
		},
		onError: (error: any) => {
			toast.error(error.message || "Failed to de-expose service");
		},
	});

	const protocol = form.watch("protocol");

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button
					variant={ingress ? "outline" : "default"}
					size="sm"
					className="gap-2"
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
							{ingress && (
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
							<Button type="submit" disabled={exposeMutation.isPending}>
								{ingress ? "Update" : "Expose"}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}

function ClusterServices() {
	const { id } = useParams({ from: "/dashboard/cluster/$id/services" });
	const queryClient = useQueryClient();

	const { data: services, isLoading } = useQuery({
		queryKey: ["services", id],
		queryFn: async () => {
			const res = await api.api.services({ clusterId: id }).get();
			if (res.error) throw res.error;
			if (!res.data.data)
				throw new Error(res.data.message || "Failed to fetch services");
			return res.data.data; // as Service[];
		},
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
			toast.error(error.message || "Failed to delete service");
		},
	});

	if (isLoading) return <div>Loading services...</div>;

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-4">
				<Link to={`/dashboard/cluster/$id`} params={{ id }}>
					<Button variant="ghost" size="icon">
						<ArrowLeft className="h-4 w-4" />
					</Button>
				</Link>
				<div>
					<h2 className="text-3xl font-bold tracking-tight">Services</h2>
					<p className="text-muted-foreground">
						List of services in this cluster
					</p>
				</div>
			</div>
			<div className="flex justify-end">
				<CreateServiceDialog clusterId={id} />
			</div>

			<Card>
				<CardContent className="p-0">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Name</TableHead>
								<TableHead>Namespace</TableHead>
								<TableHead>Type</TableHead>
								<TableHead>Ports</TableHead>
								<TableHead>Exposure</TableHead>
								<TableHead className="text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{services?.map((svc) => (
								<TableRow key={svc.id}>
									<TableCell className="font-medium">
										<div className="flex items-center gap-2">
											<Network className="h-4 w-4 text-green-500" />
											{svc.name}
										</div>
									</TableCell>
									<TableCell>{svc.namespace}</TableCell>
									<TableCell>{svc.type || "ClusterIP"}</TableCell>
									<TableCell>
										<div className="flex flex-col gap-1">
											{(svc.ports as any[])?.map((p) => (
												<div key={p.port} className="text-xs">
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
									<TableCell className="text-right">
										<div className="flex justify-end gap-2">
											<ExposureDialog service={svc} clusterId={id} />
											<Button
												variant="ghost"
												size="icon"
												className="text-destructive hover:text-destructive hover:bg-destructive/10"
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
										</div>
									</TableCell>
								</TableRow>
							))}
							{(!services || services.length === 0) && (
								<TableRow>
									<TableCell colSpan={6} className="text-center py-4">
										No services found
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
