import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
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
import { api } from "@/lib/api";

const portSchema = z.object({
	id: z.string(),
	name: z.string().optional(),
	port: z.number().min(1).max(65535),
	targetPort: z.number().min(1).max(65535),
	protocol: z.enum(["TCP", "UDP"]),
});

const serviceSchema = z.object({
	name: z.string().min(1, "Name is required"),
	namespace: z.string().min(1, "Namespace is required"),
	type: z.enum(["ClusterIP", "NodePort", "LoadBalancer"]),
	selector: z.array(
		z.object({
			id: z.string(),
			key: z.string().min(1, "Key required"),
			value: z.string().min(1, "Value required"),
		}),
	),
	ports: z.array(portSchema).min(1, "At least one port is required"),
});

interface CreateServiceDialogProps {
	clusterId: string;
	trigger?: React.ReactNode;
}

export function CreateServiceDialog({
	clusterId,
	trigger,
}: CreateServiceDialogProps) {
	const [open, setOpen] = useState(false);
	const queryClient = useQueryClient();

	const mutation = useMutation({
		mutationFn: async (values: z.infer<typeof serviceSchema>) => {
			// Convert selector array to object
			const selectorObj = values.selector.reduce(
				(acc, curr) => ({ ...acc, [curr.key]: curr.value }),
				{},
			);

			// Convert ports array to format expected by API
			const portsFormatted = values.ports.map((p) => ({
				name: p.name,
				port: p.port,
				targetPort: p.targetPort,
				protocol: p.protocol,
			}));

			const res = await api.api
				.services({
					clusterId: clusterId,
				})
				.post({
					name: values.name,
					namespace: values.namespace,
					type: values.type,
					selector: selectorObj,
					ports: portsFormatted,
				});

			if (res.error) {
				throw new Error(
					(res.error.value as any)?.message || "Failed to create service",
				);
			}

			return res.data;
		},
		onSuccess: () => {
			toast.success("Service created successfully");
			queryClient.invalidateQueries({ queryKey: ["services", clusterId] });
			setOpen(false);
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});

	const form = useForm({
		defaultValues: {
			name: "",
			namespace: "default",
			type: "ClusterIP" as "ClusterIP" | "NodePort" | "LoadBalancer",
			selector: [{ id: crypto.randomUUID(), key: "", value: "" }],
			ports: [
				{
					id: crypto.randomUUID(),
					name: "http",
					port: 80,
					targetPort: 80,
					protocol: "TCP" as "TCP" | "UDP",
				},
			],
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
						<Plus className="mr-2 h-4 w-4" /> Create Service
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Create Service</DialogTitle>
					<DialogDescription>
						Create a new Kubernetes Service to expose your application.
					</DialogDescription>
				</DialogHeader>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
					className="space-y-6 py-4"
				>
					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label htmlFor="name">Service Name</Label>
							<form.Field name="name">
								{(field) => (
									<Input
										id="name"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										placeholder="my-service"
										required
									/>
								)}
							</form.Field>
						</div>
						<div className="space-y-2">
							<Label htmlFor="namespace">Namespace</Label>
							<form.Field name="namespace">
								{(field) => (
									<Input
										id="namespace"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										placeholder="default"
										required
									/>
								)}
							</form.Field>
						</div>
					</div>

					<div className="space-y-2">
						<Label htmlFor="type">Service Type</Label>
						<form.Field name="type">
							{(field) => (
								<Select
									value={field.state.value}
									onValueChange={(value) =>
										field.handleChange(
											value as "ClusterIP" | "NodePort" | "LoadBalancer",
										)
									}
								>
									<SelectTrigger id="type">
										<SelectValue placeholder="Select type" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="ClusterIP">
											ClusterIP (Internal only)
										</SelectItem>
										<SelectItem value="NodePort">
											NodePort (Expose on each node)
										</SelectItem>
										<SelectItem value="LoadBalancer">
											LoadBalancer (Cloud provider LB)
										</SelectItem>
									</SelectContent>
								</Select>
							)}
						</form.Field>
					</div>

					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<Label>Selector (Labels)</Label>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={() =>
									form.pushFieldValue("selector", {
										id: crypto.randomUUID(),
										key: "",
										value: "",
									})
								}
							>
								<Plus className="h-3 w-3 mr-1" /> Add Label
							</Button>
						</div>
						<form.Field name="selector">
							{(field) => (
								<div className="space-y-2">
									{field.state.value.map((item, index) => (
										<div key={item.id} className="flex gap-2 items-center">
											<Input
												placeholder="Key (e.g. app)"
												value={item.key}
												onChange={(e) => {
													const newValue = [...field.state.value];
													newValue[index].key = e.target.value;
													field.handleChange(newValue);
												}}
												className="flex-1"
											/>
											<span className="text-muted-foreground">=</span>
											<Input
												placeholder="Value (e.g. backend)"
												value={item.value}
												onChange={(e) => {
													const newValue = [...field.state.value];
													newValue[index].value = e.target.value;
													field.handleChange(newValue);
												}}
												className="flex-1"
											/>
											<Button
												type="button"
												variant="ghost"
												size="icon"
												className="text-destructive hover:text-destructive shrink-0"
												onClick={() => {
													const newValue = [...field.state.value];
													newValue.splice(index, 1);
													field.handleChange(newValue);
												}}
												disabled={field.state.value.length <= 1 && index === 0} // Prevent removing last if desired, or allow empty
											>
												<Trash2 className="h-4 w-4" />
											</Button>
										</div>
									))}
								</div>
							)}
						</form.Field>
						<p className="text-[10px] text-muted-foreground">
							These labels determine which Pods the Service routes traffic to.
						</p>
					</div>

					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<Label>Ports</Label>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={() =>
									form.pushFieldValue("ports", {
										id: crypto.randomUUID(),
										name: "",
										port: 80,
										targetPort: 80,
										protocol: "TCP",
									})
								}
							>
								<Plus className="h-3 w-3 mr-1" /> Add Port
							</Button>
						</div>
						<form.Field name="ports">
							{(field) => (
								<div className="space-y-3">
									{field.state.value.map((item, index) => (
										<div
											key={item.id}
											className="grid grid-cols-[1fr,80px,80px,80px,auto] gap-2 items-end"
										>
											<div className="space-y-1">
												<Label className="text-xs text-muted-foreground">
													Name
												</Label>
												<Input
													placeholder="http"
													value={item.name}
													onChange={(e) => {
														const newValue = [...field.state.value];
														newValue[index].name = e.target.value;
														field.handleChange(newValue);
													}}
												/>
											</div>
											<div className="space-y-1">
												<Label className="text-xs text-muted-foreground">
													Port
												</Label>
												<Input
													type="number"
													placeholder="80"
													value={item.port}
													onChange={(e) => {
														const newValue = [...field.state.value];
														newValue[index].port = Number(e.target.value);
														field.handleChange(newValue);
													}}
												/>
											</div>
											<div className="space-y-1">
												<Label className="text-xs text-muted-foreground">
													Target
												</Label>
												<Input
													type="number"
													placeholder="80"
													value={item.targetPort}
													onChange={(e) => {
														const newValue = [...field.state.value];
														newValue[index].targetPort = Number(e.target.value);
														field.handleChange(newValue);
													}}
												/>
											</div>
											<div className="space-y-1">
												<Label className="text-xs text-muted-foreground">
													Proto
												</Label>
												<Select
													value={item.protocol}
													onValueChange={(value) => {
														const newValue = [...field.state.value];
														newValue[index].protocol = value as "TCP" | "UDP";
														field.handleChange(newValue);
													}}
												>
													<SelectTrigger>
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="TCP">TCP</SelectItem>
														<SelectItem value="UDP">UDP</SelectItem>
													</SelectContent>
												</Select>
											</div>
											<Button
												type="button"
												variant="ghost"
												size="icon"
												className="text-destructive hover:text-destructive mb-[2px]"
												onClick={() => {
													const newValue = [...field.state.value];
													newValue.splice(index, 1);
													field.handleChange(newValue);
												}}
												disabled={field.state.value.length <= 1}
											>
												<Trash2 className="h-4 w-4" />
											</Button>
										</div>
									))}
								</div>
							)}
						</form.Field>
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setOpen(false)}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={mutation.isPending}>
							{mutation.isPending ? "Creating..." : "Create Service"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
