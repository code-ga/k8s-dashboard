import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	useNavigate,
	useParams,
} from "@tanstack/react-router";
import { ArrowLeft, ExternalLink, HelpCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { EnvEditor, type EnvVar } from "@/components/shared/env-editor";
import RefsEditor, {
	type IConfigMapEnvFromRef,
	type IConfigMapEnvRef,
	type ISecretEnvFromRef,
	type ISecretEnvRef,
} from "@/components/shared/refs-editor";
import VolumeMountEditor, {
	type IEmptyDirVolumeMount,
	type IPvcVolumeMount,
} from "@/components/shared/volume-mount-editor";
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
import { api, getEdenErrorMessage } from "@/lib/api";
import { replaceEmptyStringsWithUndefined } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/cluster/$id/pods/create")({
	component: CreatePodPage,
});

const envVarSchema = z.object({
	name: z.string().min(1, "Name is required"),
	value: z.string().optional(),
	valueFrom: z.any().optional(),
	type: z.string().optional(),
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
	const [configMapEnvRefs, setConfigMapEnvRefs] = useState<IConfigMapEnvRef[]>(
		[],
	);
	const [configMapEnvFromRefs, setConfigMapEnvFromRefs] = useState<
		IConfigMapEnvFromRef[]
	>([]);
	const [secretEnvRefs, setSecretEnvRefs] = useState<ISecretEnvRef[]>([]);
	const [secretEnvFromRefs, setSecretEnvFromRefs] = useState<
		ISecretEnvFromRef[]
	>([]);
	const [pvcVolumes, setPvcVolumes] = useState<IPvcVolumeMount[]>([]);
	const [emptyDirVolumes, setEmptyDirVolumes] = useState<
		IEmptyDirVolumeMount[]
	>([]);

	const mutation = useMutation({
		mutationFn: async (values: z.infer<typeof podSchema>) => {
			const res = await api.api.pods({ clusterId }).post(
				replaceEmptyStringsWithUndefined({
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
							? envVars
									.filter((v) => v.name)
									.map((v) => {
										if (
											v.type === "fieldRef" ||
											(!v.type && v.valueFrom?.fieldRef)
										) {
											return { name: v.name, valueFrom: v.valueFrom };
										}
										return { name: v.name, value: v.value };
									})
							: undefined,
					configMapRefs:
						configMapEnvRefs.length > 0 || configMapEnvFromRefs.length > 0
							? {
									env:
										configMapEnvRefs.length > 0 ? configMapEnvRefs : undefined,
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
										secretEnvFromRefs.length > 0
											? secretEnvFromRefs
											: undefined,
								}
							: undefined,
					pvcVolumes: pvcVolumes.length > 0 ? pvcVolumes : undefined,
					emptyDirVolumes:
						emptyDirVolumes.length > 0 ? emptyDirVolumes : undefined,
				}),
			);

			if (res.error) {
				throw new Error(getEdenErrorMessage(res.error));
			}

			return res.data;
		},
		onSuccess: () => {
			toast.success("Pod created successfully");
			navigate({
				to: `/dashboard/cluster/$id/pods`,
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
					<div className="flex justify-between items-start">
						<div>
							<CardTitle>Pod Configuration</CardTitle>
							<CardDescription>
								Configure the basic settings, resources, and environment for
								your pod.
							</CardDescription>
						</div>
						<a
							href="https://kubernetes.io/docs/concepts/workloads/pods/"
							target="_blank"
							rel="noopener noreferrer"
							className="text-sm text-primary hover:underline flex items-center gap-1"
						>
							Pod Docs <ExternalLink className="h-4 w-4" />
						</a>
					</div>
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
						{/* Basic Info */}
						<div className="space-y-4">
							<div className="flex items-center justify-between">
								<h3 className="text-lg font-semibold flex items-center gap-2">
									General Information
									<HelpCircle className="h-4 w-4 text-muted-foreground" />
								</h3>
							</div>
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
								<div className="flex items-center justify-between">
									<Label htmlFor="image">Docker Image</Label>
									<a
										href="https://kubernetes.io/docs/concepts/containers/images/"
										target="_blank"
										rel="noopener noreferrer"
										className="text-xs text-primary hover:underline flex items-center gap-1"
									>
										Image Docs <ExternalLink className="h-3 w-3" />
									</a>
								</div>
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
						</div>

						{/* Resources */}
						<div className="space-y-4 border-t pt-4">
							<div className="flex items-center justify-between">
								<h3 className="text-lg font-semibold flex items-center gap-2">
									Resources
									<HelpCircle className="h-4 w-4 text-muted-foreground" />
								</h3>
								<a
									href="https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/"
									target="_blank"
									rel="noopener noreferrer"
									className="text-xs text-primary hover:underline flex items-center gap-1"
								>
									Resource Docs <ExternalLink className="h-3 w-3" />
								</a>
							</div>
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
						<div className="space-y-4 border-t pt-4">
							<div className="flex items-center justify-between">
								<h3 className="text-lg font-semibold flex items-center gap-2">
									Command & Arguments
									<HelpCircle className="h-4 w-4 text-muted-foreground" />
								</h3>
								<a
									href="https://kubernetes.io/docs/tasks/inject-data-application/define-command-argument-container/"
									target="_blank"
									rel="noopener noreferrer"
									className="text-xs text-primary hover:underline flex items-center gap-1"
								>
									Exec Docs <ExternalLink className="h-3 w-3" />
								</a>
							</div>
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
						<div className="space-y-4 border-t pt-4">
							<div className="flex items-center justify-between">
								<h3 className="text-lg font-semibold flex items-center gap-2">
									Environment Variables
									<HelpCircle className="h-4 w-4 text-muted-foreground" />
								</h3>
								<a
									href="https://kubernetes.io/docs/tasks/inject-data-application/define-environment-variable-container/"
									target="_blank"
									rel="noopener noreferrer"
									className="text-xs text-primary hover:underline flex items-center gap-1"
								>
									Env Docs <ExternalLink className="h-3 w-3" />
								</a>
							</div>
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
									onChange={(r) => {
										setConfigMapEnvRefs(r.configMapRefs?.env || []);
										setConfigMapEnvFromRefs(r.configMapRefs?.envFrom || []);
										setSecretEnvRefs(r.secretRefs?.env || []);
										setSecretEnvFromRefs(r.secretRefs?.envFrom || []);
									}}
								/>
							</div>
						</div>

						<div className="space-y-4 border-t pt-4">
							<div className="flex items-center justify-between">
								<h3 className="text-lg font-semibold flex items-center gap-2">
									Volume Mounts
									<HelpCircle className="h-4 w-4 text-muted-foreground" />
								</h3>
								<a
									href="https://kubernetes.io/docs/concepts/storage/volumes/"
									target="_blank"
									rel="noopener noreferrer"
									className="text-xs text-primary hover:underline flex items-center gap-1"
								>
									Volume Docs <ExternalLink className="h-3 w-3" />
								</a>
							</div>
							<VolumeMountEditor
								clusterId={clusterId}
								pvcVolumes={pvcVolumes}
								emptyDirVolumes={emptyDirVolumes}
								onChange={(v) => {
									setPvcVolumes(v.pvcVolumes);
									setEmptyDirVolumes(v.emptyDirVolumes);
								}}
							/>
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
	);
}
