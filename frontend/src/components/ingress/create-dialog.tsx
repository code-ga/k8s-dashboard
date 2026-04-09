import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { databaseTypes, SchemaStatic } from "@/lib/api";
import { api } from "@/lib/api";

type Service = SchemaStatic<databaseTypes.databaseTypes["k8sServices"]>;

const ingressSchema = z.object({
	serviceId: z.string().min(1, "Service is required"),
	domain: z.string().optional(),
	path: z.string().default("/"),
	port: z.number().optional(),
	protocol: z.enum(["http", "tcp", "udp"]),
	tls: z.boolean().default(true),
});

interface CreateIngressDialogProps {
	clusterId: string;
	trigger?: React.ReactNode;
}

export function CreateIngressDialog({
	clusterId,
	trigger,
}: CreateIngressDialogProps) {
	const [open, setOpen] = useState(false);
	const queryClient = useQueryClient();

	// Fetch services for selection
	const { data: services } = useQuery({
		queryKey: ["services", clusterId],
		queryFn: async () => {
			const res = await api.api.services({ clusterId }).get();
			if (res.error) throw res.error;
			return res.data.data as Service[];
		},
		enabled: open, // Only fetch when dialog opens
	});

	const mutation = useMutation({
		mutationFn: async (values: z.infer<typeof ingressSchema>) => {
			const selectedService = services?.find(
				(s) => s.id.toString() === values.serviceId,
			);

			if (!selectedService) {
				throw new Error("Selected service not found");
			}

			// We use the same 'expose' endpoint logic or create a dedicated 'create' one.
			// The current backend 'expose' endpoint handles ingress creation.
			const res = await api.api
				.ingresses({
					clusterId: clusterId,
				})
				.expose.post({
					serviceName: selectedService.name,
					namespace: selectedService.namespace,
					protocol: values.protocol,
					internalPort: selectedService.ports?.data?.[0]?.port || 80,
					domain: values.domain || undefined,
					tls: values.tls,
				});

			if (res.error) {
				if (typeof res.error.value === "string") {
					throw new Error(res.error.value);
				}
				throw new Error(res.error.value?.message || "Failed to create ingress");
			}

			return res.data;
		},
		onSuccess: () => {
			toast.success("Ingress created successfully");
			queryClient.invalidateQueries({ queryKey: ["ingresses", clusterId] });
			queryClient.invalidateQueries({ queryKey: ["services", clusterId] });
			setOpen(false);
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});

	const form = useForm({
		defaultValues: {
			serviceId: "",
			domain: "",
			path: "/",
			port: undefined as number | undefined,
			protocol: "http" as "http" | "tcp" | "udp",
			tls: true,
		},
		onSubmit: async ({ value }) => {
			await mutation.mutateAsync(value);
		},
	});

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				{trigger || (
					<Button>
						<Plus className="mr-2 h-4 w-4" /> Create Ingress
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-[500px]">
				<DialogHeader>
					<DialogTitle>Create Ingress</DialogTitle>
					<DialogDescription>
						Expose a service using an Ingress rule.
					</DialogDescription>
				</DialogHeader>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
					className="space-y-4 py-4"
				>
					<div className="space-y-2">
						<Label htmlFor="service">Service</Label>
						<form.Field name="serviceId">
							{(field) => (
								<Select
									value={field.state.value}
									onValueChange={(value) => field.handleChange(value)}
								>
									<SelectTrigger id="service">
										<SelectValue placeholder="Select a service" />
									</SelectTrigger>
									<SelectContent>
										{services?.map((svc) => (
											<SelectItem key={svc.id} value={svc.id.toString()}>
												{svc.name} ({svc.namespace})
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							)}
						</form.Field>
					</div>

					<div className="space-y-2">
						<Label htmlFor="protocol">Protocol</Label>
						<form.Field name="protocol">
							{(field) => (
								<Select
									value={field.state.value}
									onValueChange={(value) =>
										field.handleChange(value as "http" | "tcp" | "udp")
									}
								>
									<SelectTrigger id="protocol">
										<SelectValue placeholder="Select protocol" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="http">HTTP</SelectItem>
										<SelectItem value="tcp">TCP</SelectItem>
										<SelectItem value="udp">UDP</SelectItem>
									</SelectContent>
								</Select>
							)}
						</form.Field>
					</div>

					<form.Subscribe selector={(state) => state.values.protocol}>
						{(protocol) => (
							<>
								{protocol === "http" && (
									<>
										<div className="space-y-2">
											<Label htmlFor="domain">Domain</Label>
											<form.Field name="domain">
												{(field) => (
													<Input
														id="domain"
														value={field.state.value}
														onBlur={field.handleBlur}
														onChange={(e) => field.handleChange(e.target.value)}
														placeholder="myapp.example.com"
													/>
												)}
											</form.Field>
										</div>
										<div className="flex items-center justify-between space-y-2">
											<Label htmlFor="tls">Enable TLS</Label>
											<form.Field name="tls">
												{(field) => (
													<Switch
														id="tls"
														checked={field.state.value}
														onCheckedChange={field.handleChange}
													/>
												)}
											</form.Field>
										</div>
									</>
								)}
							</>
						)}
					</form.Subscribe>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setOpen(false)}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={mutation.isPending}>
							{mutation.isPending ? "Creating..." : "Create Ingress"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
