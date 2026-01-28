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

	const form = useForm({
		defaultValues: {
			protocol: (service.exposureProtocol as "http" | "tcp" | "udp") || "http",
			domain: service.domain || "",
			internalPort: service.internalPort || 80,
		},
	});

	const exposeMutation = useMutation({
		mutationFn: async (values: any) => {
			const res = await api.api.services({ clusterId }).expose.post({
				name: service.name,
				namespace: service.namespace,
				protocol: values.protocol,
				internalPort: values.internalPort,
				domain: values.protocol === "http" ? values.domain : undefined,
				selector: JSON.parse(service.selector || "{}"),
				labels: JSON.parse(service.labels || "{}"),
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
			const res = await api.api
				.services({ clusterId })
				["de-expose"]({ id: String(service.id) })
				.post();
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
					variant={service.exposureProtocol ? "outline" : "default"}
					size="sm"
					className="gap-2"
				>
					{service.exposureProtocol ? (
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
							{service.exposureProtocol && (
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
								{service.exposureProtocol ? "Update" : "Expose"}
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

	const { data: services, isLoading } = useQuery({
		queryKey: ["services", id],
		queryFn: async () => {
			const res = await api.api.services({ clusterId: id }).get();
			if (res.error) throw res.error;
			if (!res.data.data)
				throw new Error(res.data.message || "Failed to fetch services");
			return res.data.data as Service[];
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

			<Card>
				<CardContent className="p-0">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Name</TableHead>
								<TableHead>Namespace</TableHead>
								<TableHead>Type</TableHead>
								<TableHead>Internal Port</TableHead>
								<TableHead>Exposure</TableHead>
								<TableHead className="text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{services?.map((svc) => (
								<TableRow key={svc.id}>
									<TableCell className="font-medium flex items-center gap-2">
										<Network className="h-4 w-4 text-green-500" />
										{svc.name}
									</TableCell>
									<TableCell>{svc.namespace}</TableCell>
									<TableCell>{svc.type || "ClusterIP"}</TableCell>
									<TableCell>{svc.internalPort}</TableCell>
									<TableCell>
										{svc.exposureProtocol ? (
											<div className="flex items-center gap-2 text-sm text-green-600 font-medium whitespace-nowrap">
												<ShieldCheck className="h-4 w-4" />
												{svc.exposureProtocol.toUpperCase()}
												{svc.externalPort ? `:${svc.externalPort}` : ""}
												{svc.domain ? ` (${svc.domain})` : ""}
											</div>
										) : (
											<div className="flex items-center gap-2 text-sm text-muted-foreground whitespace-nowrap">
												<ShieldAlert className="h-4 w-4" />
												Internal Only
											</div>
										)}
									</TableCell>
									<TableCell className="text-right">
										<ExposureDialog service={svc} clusterId={id} />
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
