import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useForm } from "@tanstack/react-form";
import { EnvEditor, type EnvVar } from "@/components/shared/env-editor";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import {
	createFileRoute,
	Link,
	useNavigate,
	useParams,
} from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/dashboard/cluster/$id/pods/create")({
	component: CreatePodPage,
});

const envVarSchema = z.object({
	name: z.string().min(1, "Name is required"),
	value: z.string(),
});

const podSchema = z.object({
	name: z
		.string()
		.min(1, "Name is required")
		.max(253, "Name must be less than 253 characters"),
	namespace: z.string().min(1, "Namespace is required"),
	image: z.string().min(1, "Image is required"),
	cpuRequest: z.string().optional(),
	memoryRequest: z.string().optional(),
	cpuLimit: z.string().optional(),
	memoryLimit: z.string().optional(),
	command: z.string().optional(),
	args: z.string().optional(),
	envVars: z.array(envVarSchema).optional(),
});

function CreatePodPage() {
	const { id: clusterId } = useParams({
		from: "/dashboard/cluster/$id/pods/create",
	});
	const navigate = useNavigate();
	const [envVars, setEnvVars] = useState<EnvVar[]>([]);

	const mutation = useMutation({
		mutationFn: async (values: z.infer<typeof podSchema>) => {
			const res = await api.api.pods({ clusterId }).post({
				name: values.name,
				namespace: values.namespace,
				image: values.image,
				resources: {
					requests: {
						cpu: values.cpuRequest || undefined,
						memory: values.memoryRequest || undefined,
					},
					limits: {
						cpu: values.cpuLimit || undefined,
						memory: values.memoryLimit || undefined,
					},
				},
				command: values.command ? values.command.split(" ") : undefined,
				args: values.args ? values.args.split(" ") : undefined,
				env:
					envVars.length > 0
						? envVars.reduce(
								(acc, curr) => {
									if (curr.name) acc[curr.name] = curr.value;
									return acc
								},
								{} as Record<string, string>,
							)
						: undefined,
			})

			if (res.error) {
				throw new Error(res.error.value?.message || "Failed to create pod");
			}

			return res.data;
		},
		onSuccess: () => {
			toast.success("Pod created successfully");
			navigate({
				to: `/dashboard/cluster/$id/pods`,
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
			image: "",
			cpuRequest: "",
			memoryRequest: "",
			cpuLimit: "",
			memoryLimit: "",
			command: "",
			args: "",
		},
		onSubmit: async ({ value }) => {
			await mutation.mutateAsync({ ...value, envVars });
		},
	});

	return (
		<div className="max-w-4xl mx-auto space-y-6">
			<div className="flex items-center gap-4">
				<Link to={`/dashboard/cluster/$id/pods`} params={{ id: clusterId }}>
					<Button variant="ghost" size="icon">
						<ArrowLeft className="h-4 w-4" />
					</Button>
				</Link>
				<div>
					<h2 className="text-3xl font-bold tracking-tight">Create Pod</h2>
					<p className="text-muted-foreground">
						Create a new Kubernetes pod in this cluster.
					</p>
				</div>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Pod Configuration</CardTitle>
					<CardDescription>
						Configure the basic settings, resources, and environment for your
						pod.
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
						{/* Basic Info */}
						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label htmlFor="name">Pod Name</Label>
								<form.Field name="name">
									{(field) => (
										<>
											<Input
												id="name"
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												placeholder="my-pod"
											/>
											{field.state.meta.errors && (
												<p className="text-xs text-destructive">
													{field.state.meta.errors.join(", ")}
												</p>
											)}
										</>
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
										/>
									)}
								</form.Field>
							</div>
						</div>

						<div className="space-y-2">
							<Label htmlFor="image">Docker Image</Label>
							<form.Field name="image">
								{(field) => (
									<>
										<Input
											id="image"
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											placeholder="nginx:latest"
										/>
										{field.state.meta.errors && (
											<p className="text-xs text-destructive">
												{field.state.meta.errors.join(", ")}
											</p>
										)}
									</>
								)}
							</form.Field>
						</div>

						{/* Resources */}
						<div className="space-y-4">
							<h3 className="text-lg font-medium">Resources</h3>
							<div className="grid grid-cols-2 gap-6">
								<div className="space-y-2">
									<Label>Resource Requests</Label>
									<div className="grid grid-cols-2 gap-2">
										<form.Field name="cpuRequest">
											{(field) => (
												<Input
													value={field.state.value}
													onBlur={field.handleBlur}
													onChange={(e) => field.handleChange(e.target.value)}
													placeholder="CPU (e.g., 100m)"
												/>
											)}
										</form.Field>
										<form.Field name="memoryRequest">
											{(field) => (
												<Input
													value={field.state.value}
													onBlur={field.handleBlur}
													onChange={(e) => field.handleChange(e.target.value)}
													placeholder="Memory (e.g., 128Mi)"
												/>
											)}
										</form.Field>
									</div>
								</div>

								<div className="space-y-2">
									<Label>Resource Limits</Label>
									<div className="grid grid-cols-2 gap-2">
										<form.Field name="cpuLimit">
											{(field) => (
												<Input
													value={field.state.value}
													onBlur={field.handleBlur}
													onChange={(e) => field.handleChange(e.target.value)}
													placeholder="CPU (e.g., 500m)"
												/>
											)}
										</form.Field>
										<form.Field name="memoryLimit">
											{(field) => (
												<Input
													value={field.state.value}
													onBlur={field.handleBlur}
													onChange={(e) => field.handleChange(e.target.value)}
													placeholder="Memory (e.g., 256Mi)"
												/>
											)}
										</form.Field>
									</div>
								</div>
							</div>
						</div>

						{/* Command and Args */}
						<div className="space-y-4">
							<h3 className="text-lg font-medium">Command & Arguments</h3>
							<div className="space-y-2">
								<Label htmlFor="command">Command (optional)</Label>
								<form.Field name="command">
									{(field) => (
										<Input
											id="command"
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											placeholder="/bin/sh -c"
										/>
									)}
								</form.Field>
							</div>

							<div className="space-y-2">
								<Label htmlFor="args">Arguments (optional)</Label>
								<form.Field name="args">
									{(field) => (
										<Textarea
											id="args"
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											placeholder="echo hello"
										/>
									)}
								</form.Field>
							</div>
						</div>

						{/* Environment Variables */}
						<div className="space-y-4">
							<h3 className="text-lg font-medium">Environment Variables</h3>
							<EnvEditor variables={envVars} onChange={setEnvVars} />
						</div>

						<div className="flex justify-end gap-4">
							<Link
								to={`/dashboard/cluster/$id/pods`}
								params={{ id: clusterId }}
							>
								<Button variant="outline" type="button">
									Cancel
								</Button>
							</Link>
							<Button type="submit" disabled={mutation.isPending}>
								{mutation.isPending ? "Creating..." : "Create Pod"}
							</Button>
						</div>
					</form>
				</CardContent>
			</Card>
		</div>
	)
}
