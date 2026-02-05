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
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useForm } from "@tanstack/react-form";
import { EnvEditor, type EnvVar } from "../shared/env-editor";
import { z } from "zod";
import { useState } from "react";
import { Plus } from "lucide-react";
import { useQueryClient, useMutation } from "@tanstack/react-query";

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

interface CreateDeploymentDialogProps {
	clusterId: string;
}

export function CreateDeploymentDialog({
	clusterId,
}: CreateDeploymentDialogProps) {
	const [open, setOpen] = useState(false);
	const [envVars, setEnvVars] = useState<EnvVar[]>([]);
	const queryClient = useQueryClient();

	const mutation = useMutation({
		mutationFn: async (values: z.infer<typeof deploymentSchema>) => {
			// Parse labels and selector from comma-separated strings
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
				env: envVars.length > 0 ? envVars : undefined,
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
			queryClient.invalidateQueries({ queryKey: ["deployments", clusterId] });
			setOpen(false);
			setEnvVars([]);
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
		// validatorAdapter: zodValidator(),
		// validators: {
		// 	onChange: deploymentSchema,
		// },
		onSubmit: async ({ value }) => {
			await mutation.mutateAsync({ ...value, envVars });
		},
	});

	/* Removed redundant setEnvVars/updateEnvVar functions */

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button>
					<Plus className="mr-2 h-4 w-4" /> Create Deployment
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Create Deployment</DialogTitle>
					<DialogDescription>
						Create a new Kubernetes deployment in this cluster.
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
					{/* Basic Info */}
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
										onChange={(e) => field.handleChange(Number(e.target.value))}
									/>
								)}
							</form.Field>
						</div>
					</div>

					{/* Labels and Selector */}
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

					{/* Resources */}
					<div className="space-y-2">
						<Label>Resource Requests</Label>
						<div className="grid grid-cols-2 gap-4">
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
						<div className="grid grid-cols-2 gap-4">
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

					{/* Command and Args */}
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

					{/* Environment Variables */}
					<EnvEditor variables={envVars} onChange={setEnvVars} />

					<DialogFooter>
						<Button type="submit" disabled={mutation.isPending}>
							{mutation.isPending ? "Creating..." : "Create Deployment"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
