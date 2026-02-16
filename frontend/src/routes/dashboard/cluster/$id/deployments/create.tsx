import { EnvEditor, type EnvVar } from "@/components/shared/env-editor";
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
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	useNavigate,
	useParams,
} from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import RefsEditor from "../../../../../components/shared/refs-editor";

export const Route = createFileRoute(
	"/dashboard/cluster/$id/deployments/create",
)({
	component: CreateDeploymentPage,
});

const envVarSchema = z.object({
	name: z.string().min(1, "Name is required"),
	value: z.string(),
});

const deploymentSchema = z.object({
	name: z
		.string()
		.min(1, "Name is required")
		.max(253, "Name must be less than 253 characters"),
	namespace: z.string().min(1, "Namespace is required"),
	image: z.string().min(1, "Image is required"),
	replicas: z.coerce.number().min(0, "Replicas must be at least 0").default(1),
	cpuRequest: z.string().optional(),
	memoryRequest: z.string().optional(),
	cpuLimit: z.string().optional(),
	memoryLimit: z.string().optional(),
	command: z.string().optional(),
	args: z.string().optional(),
	labels: z.string().optional(),
	selector: z.string().optional(),
	envVars: z.array(envVarSchema).optional(),
});

function CreateDeploymentPage() {
	const { id: clusterId } = useParams({
		from: "/dashboard/cluster/$id/deployments/create",
	});
	const navigate = useNavigate();
	const [envVars, setEnvVars] = useState<EnvVar[]>([]);
	const [configMapEnvRefs, setConfigMapEnvRefs] = useState<any[]>([]);
	const [configMapEnvFromRefs, setConfigMapEnvFromRefs] = useState<any[]>([]);
	const [secretEnvRefs, setSecretEnvRefs] = useState<any[]>([]);
	const [secretEnvFromRefs, setSecretEnvFromRefs] = useState<any[]>([]);

	// temp inputs

	// TODO: fetch configmaps and secrets for refs editor
	// const { data: configMaps } = useQuery({
	// 	queryKey: ["configmaps", clusterId],
	// 	queryFn: async () => {
	// 		const res = await api.api.configmaps({ clusterId }).get();
	// 		if (res.error) throw res.error;
	// 		return res.data.data as any[];
	// 	},
	// });

	// const { data: secrets } = useQuery({
	// 	queryKey: ["secrets", clusterId],
	// 	queryFn: async () => {
	// 		const res = await api.api.secrets({ clusterId }).get();
	// 		if (res.error) throw res.error;
	// 		return res.data.data as any[];
	// 	},
	// });

	// refs state for RefsEditor
	const mutation = useMutation({
		mutationFn: async (values: z.infer<typeof deploymentSchema>) => {
			const parseLabels = (str: string | undefined) => {
				if (!str) return undefined;
				const result: Record<string, string> = {};
				str.split(",").forEach((pair) => {
					const [key, value] = pair.split("=").map((s) => s.trim());
					if (key && value) result[key] = value;
				});
				return Object.keys(result).length > 0 ? result : undefined;
			};

			const res = await api.api.deployments({ clusterId }).post({
				name: values.name,
				namespace: values.namespace,
				image: values.image,
				replicas: values.replicas,
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
									return acc;
								},
								{} as Record<string, string>,
							)
						: undefined,
				configMapRefs:
					configMapEnvRefs.length > 0 || configMapEnvFromRefs.length > 0
						? {
								env: configMapEnvRefs.length > 0 ? configMapEnvRefs : undefined,
								envFrom:
									configMapEnvFromRefs.length > 0
										? configMapEnvFromRefs
										: undefined,
							}
						: undefined,
				secretRefs:
					secretEnvRefs.length > 0 || secretEnvFromRefs.length > 0
						? {
								env: secretEnvRefs.length > 0 ? secretEnvRefs : undefined,
								envFrom:
									secretEnvFromRefs.length > 0 ? secretEnvFromRefs : undefined,
							}
						: undefined,
				labels: parseLabels(values.labels),
				selector: parseLabels(values.selector),
			});

			if (res.error) {
				throw new Error(
					res.error.value?.message || "Failed to create deployment",
				);
			}

			return res.data;
		},
		onSuccess: () => {
			toast.success("Deployment created successfully");
			navigate({
				to: `/dashboard/cluster/$id/deployments`,
				params: { id: clusterId },
			});
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
			replicas: 1,
			cpuRequest: "",
			memoryRequest: "",
			cpuLimit: "",
			memoryLimit: "",
			command: "",
			args: "",
			labels: "",
			selector: "",
		},
		onSubmit: async ({ value }) => {
			await mutation.mutateAsync({ ...value, envVars });
		},
	});

	return (
		<div className="max-w-4xl mx-auto space-y-6">
			<div className="flex items-center gap-4">
				<Link
					to={`/dashboard/cluster/$id/deployments`}
					params={{ id: clusterId }}
				>
					<Button variant="ghost" size="icon">
						<ArrowLeft className="h-4 w-4" />
					</Button>
				</Link>
				<div>
					<h2 className="text-3xl font-bold tracking-tight">
						Create Deployment
					</h2>
					<p className="text-muted-foreground">
						Create a new Kubernetes deployment in this cluster.
					</p>
				</div>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Deployment Configuration</CardTitle>
					<CardDescription>
						Configure the basic settings, resources, and environment for your
						deployment.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form
						onSubmit={(e) => {
							e.preventDefault();
							e.stopPropagation();
							form.handleSubmit();
						}}
						className="space-y-6"
					>
						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label htmlFor="name">Deployment Name</Label>
								<form.Field name="name">
									{(field) => (
										<>
											<Input
												id="name"
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												placeholder="my-deployment"
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

						<div className="grid grid-cols-2 gap-4">
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
							<div className="space-y-2">
								<Label htmlFor="replicas">Replicas</Label>
								<form.Field name="replicas">
									{(field) => (
										<Input
											id="replicas"
											type="number"
											min={0}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) =>
												field.handleChange(Number(e.target.value))
											}
										/>
									)}
								</form.Field>
							</div>
						</div>

						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label htmlFor="labels">
									Labels (key=value, comma-separated)
								</Label>
								<form.Field name="labels">
									{(field) => (
										<Input
											id="labels"
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											placeholder="app=myapp, tier=frontend"
										/>
									)}
								</form.Field>
							</div>
							<div className="space-y-2">
								<Label htmlFor="selector">Selector (key=value)</Label>
								<form.Field name="selector">
									{(field) => (
										<Input
											id="selector"
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											placeholder="app=myapp"
										/>
									)}
								</form.Field>
							</div>
						</div>

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

						<div className="space-y-4">
							<h3 className="text-lg font-medium">Environment Variables</h3>
							<EnvEditor variables={envVars} onChange={setEnvVars} />
							<div className="pt-4">
								<RefsEditor
									clusterId={clusterId}
									configMapRefs={{
										env: configMapEnvRefs,
										envFrom: configMapEnvFromRefs,
									}}
									secretRefs={{
										env: secretEnvRefs,
										envFrom: secretEnvFromRefs,
									}}
									onChange={(r: any) => {
										setConfigMapEnvRefs(r.configMapRefs?.env || []);
										setConfigMapEnvFromRefs(r.configMapRefs?.envFrom || []);
										setSecretEnvRefs(r.secretRefs?.env || []);
										setSecretEnvFromRefs(r.secretRefs?.envFrom || []);
									}}
								/>
							</div>
						</div>

						<div className="flex justify-end gap-4">
							<Link
								to={`/dashboard/cluster/$id/deployments`}
								params={{ id: clusterId }}
							>
								<Button variant="outline" type="button">
									Cancel
								</Button>
							</Link>
							<Button type="submit" disabled={mutation.isPending}>
								{mutation.isPending ? "Creating..." : "Create Deployment"}
							</Button>
						</div>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
