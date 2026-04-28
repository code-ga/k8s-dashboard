import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	useNavigate,
	useParams,
} from "@tanstack/react-router";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
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
import { replaceEmptyStringsWithUndefined } from "@/lib/utils";

export const Route = createFileRoute("/_protected/dashboard/cluster/$id/services/create")({
	component: CreateServicePage,
});

const portSchema = z.object({
	id: z.string(),
	name: z
		.string()
		.optional()
		.refine((val) => !val || val.length >= 1, "Name cannot be empty"),
	port: z.number().min(1, "Min 1").max(65535, "Max 65535"),
	targetPort: z.number().min(1, "Min 1").max(65535, "Max 65535"),
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

function CreateServicePage() {
	const { id: clusterId } = useParams({
		from: "/_protected/dashboard/cluster/$id/services/create",
	});
	const navigate = useNavigate();

	const mutation = useMutation({
		mutationFn: async (values: z.infer<typeof serviceSchema>) => {
			const selectorObj = Object.fromEntries(
				values.selector.map((s) => [s.key, s.value]),
			)

			const portsFormatted = values.ports.map((p) => ({
				name: p.name,
				port: p.port,
				targetPort: p.targetPort,
				protocol: p.protocol,
			}))

			const res = await api.api
				.services({
					clusterId: clusterId,
				})
				.post(
					replaceEmptyStringsWithUndefined({
						name: values.name,
						namespace: values.namespace,
						type: values.type,
						selector: selectorObj,
						ports: portsFormatted,
					}),
				)

			if (res.error) {
				throw new Error(res.error.value?.message || "Failed to create service");
			}

			return res.data;
		},
		onSuccess: () => {
			toast.success("Service created successfully");
			navigate({
				to: "/dashboard/cluster/$id/services",
				params: { id: clusterId },
			})
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
		<div className="max-w-4xl mx-auto space-y-6">
			<div className="flex items-center gap-4">
				<Link to="/dashboard/cluster/$id/services" params={{ id: clusterId }}>
					<Button variant="ghost" size="icon">
						<ArrowLeft className="h-4 w-4" />
					</Button>
				</Link>
				<div>
					<h2 className="text-3xl font-bold tracking-tight">Create Service</h2>
					<p className="text-muted-foreground">
						Create a new Kubernetes Service to expose your application.
					</p>
				</div>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Service Configuration</CardTitle>
					<CardDescription>
						Provide a name, namespace, type, and selector labels for the
						Service.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form
						onSubmit={(e) => {
							e.preventDefault()
							e.stopPropagation()
							form.handleSubmit()
						}}
						className="space-y-6"
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

						<div className="space-y-4">
							<div className="flex items-center justify-between">
								<Label className="text-lg font-medium">Selector (Labels)</Label>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() =>
										form.pushFieldValue("selector", {
											id: crypto.randomUUID(),
											key: "",
											value: "",
										})
									}
								>
									<Plus className="h-4 w-4 mr-1" /> Add Label
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
														const newValue = [...field.state.value]
														newValue[index].key = e.target.value
														field.handleChange(newValue)
													}}
													className="flex-1"
												/>
												<span className="text-muted-foreground">=</span>
												<Input
													placeholder="Value (e.g. backend)"
													value={item.value}
													onChange={(e) => {
														const newValue = [...field.state.value]
														newValue[index].value = e.target.value
														field.handleChange(newValue)
													}}
													className="flex-1"
												/>
												<Button
													type="button"
													variant="ghost"
													size="icon"
													className="text-destructive hover:text-destructive shrink-0"
													onClick={() => {
														const newValue = [...field.state.value]
														newValue.splice(index, 1)
														field.handleChange(newValue)
													}}
													disabled={
														field.state.value.length <= 1 && index === 0
													}
												>
													<Trash2 className="h-4 w-4" />
												</Button>
											</div>
										))}
									</div>
								)}
							</form.Field>
							<p className="text-xs text-muted-foreground italic">
								These labels determine which Pods the Service routes traffic to.
							</p>
						</div>

						<div className="space-y-4">
							<div className="flex items-center justify-between">
								<Label className="text-lg font-medium">Ports</Label>
								<Button
									type="button"
									variant="outline"
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
									<Plus className="h-4 w-4 mr-1" /> Add Port
								</Button>
							</div>
							<form.Field name="ports">
								{(field) => (
									<div className="space-y-3">
										{field.state.value.map((item, index) => (
											<div
												key={item.id}
												className="grid grid-cols-[1fr,100px,100px,100px,auto] gap-4 items-end"
											>
												<div className="space-y-2">
													<Label className="text-xs">Name</Label>
													<Input
														placeholder="http"
														value={item.name}
														onChange={(e) => {
															const newValue = [...field.state.value]
															newValue[index].name = e.target.value
															field.handleChange(newValue)
														}}
													/>
												</div>
												<div className="space-y-2">
													<Label className="text-xs">Port</Label>
													<Input
														type="number"
														placeholder="80"
														value={item.port}
														onChange={(e) => {
															const newValue = [...field.state.value]
															newValue[index].port = Number(e.target.value);
															field.handleChange(newValue)
														}}
													/>
												</div>
												<div className="space-y-2">
													<Label className="text-xs">Target Port</Label>
													<Input
														type="number"
														placeholder="80"
														value={item.targetPort}
														onChange={(e) => {
															const newValue = [...field.state.value]
															newValue[index].targetPort = Number(
																e.target.value,
															)
															field.handleChange(newValue)
														}}
													/>
												</div>
												<div className="space-y-2">
													<Label className="text-xs">Protocol</Label>
													<Select
														value={item.protocol}
														onValueChange={(value) => {
															const newValue = [...field.state.value]
															newValue[index].protocol = value as "TCP" | "UDP";
															field.handleChange(newValue)
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
														const newValue = [...field.state.value]
														newValue.splice(index, 1)
														field.handleChange(newValue)
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

						<div className="flex justify-end gap-4 pt-4 border-t">
							<Link
								to="/dashboard/cluster/$id/services"
								params={{ id: clusterId }}
							>
								<Button variant="outline" type="button">
									Cancel
								</Button>
							</Link>
							<Button type="submit" disabled={mutation.isPending}>
								{mutation.isPending ? "Creating..." : "Create Service"}
							</Button>
						</div>
					</form>
				</CardContent>
			</Card>
		</div>
	)
}
