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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api, getEdenErrorMessage } from "@/lib/api";

export const Route = createFileRoute("/dashboard/cluster/$id/secrets/create")({
	component: CreateSecretPage,
});

const secretSchema = z.object({
	name: z
		.string()
		.min(1, "Name is required")
		.max(253, "Name must be less than 253 characters"),
	namespace: z.string().min(1, "Namespace is required"),
	type: z.string(),
});

/**
 * CreateSecretPage component for creating a new Kubernetes Secret.
 *
 * Manages the creation of a Secret resource with name, namespace, type, and key-value data pairs.
 * Handles form submission, API communication, and navigation after successful creation.
 *
 * @component
 * @returns {JSX.Element} A page containing:
 * - Navigation header with back button
 * - Secret configuration form with fields for name, namespace, and type selection
 * - Environment variable editor for secret data key-value pairs
 * - Action buttons for cancellation and submission
 *
 * @remarks
 * - Uses TanStack Router for navigation and route parameters
 * - Integrates TanStack Form for form state management and validation
 * - Uses React Query (useMutation) for async API calls
 * - Display success/error toasts upon completion or failure
 * - Re-renders occur when: component mounts, route params change, form state updates, dataVars changes, or mutation state changes
 * - Each function call creates a new component instance; re-renders within the instance lifecycle depend on state/prop changes
 */
function CreateSecretPage() {
	const { id: clusterId } = useParams({
		from: "/dashboard/cluster/$id/secrets/create",
	});
	const navigate = useNavigate();
	const [dataVars, setDataVars] = useState<EnvVar[]>([]);

	const mutation = useMutation({
		mutationFn: async (values: z.infer<typeof secretSchema>) => {
			const data: Record<string, string> = {};
			for (const v of dataVars) {
				if (v.name && v.value) data[v.name] = v.value;
			}

			const res = await api.api.secrets({ clusterId }).post({
				name: values.name,
				namespace: values.namespace,
				type: values.type,
				data,
			});

			if (res.error) {
				throw new Error(getEdenErrorMessage(res.error));
			}

			return res.data;
		},
		onSuccess: () => {
			toast.success("Secret created successfully");
			navigate({
				to: `/dashboard/cluster/$id/secrets`,
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
			type: "Opaque",
		},
		onSubmit: async ({ value }) => {
			await mutation.mutateAsync(value);
		},
	});

	return (
		<div className="max-w-4xl mx-auto space-y-6">
			<div className="flex items-center gap-4">
				<Link to={`/dashboard/cluster/$id/secrets`} params={{ id: clusterId }}>
					<Button variant="ghost" size="icon">
						<ArrowLeft className="h-4 w-4" />
					</Button>
				</Link>
				<div>
					<h2 className="text-3xl font-bold tracking-tight">Create Secret</h2>
					<p className="text-muted-foreground">
						Create a new Secret for storing sensitive information.
					</p>
				</div>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Secret Configuration</CardTitle>
					<CardDescription>
						Provide a name, namespace, type, and key-value pairs for the Secret.
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
								<Label htmlFor="name">Name</Label>
								<form.Field name="name">
									{(field) => (
										<>
											<Input
												id="name"
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												placeholder="my-secret"
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
							<Label htmlFor="type">Secret Type</Label>
							<form.Field name="type">
								{(field) => (
									<Select
										value={field.state.value}
										onValueChange={field.handleChange}
									>
										<SelectTrigger>
											<SelectValue placeholder="Select type" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="Opaque">Opaque</SelectItem>
											<SelectItem value="kubernetes.io/service-account-token">
												Service Account Token
											</SelectItem>
											<SelectItem value="kubernetes.io/dockercfg">
												Docker Config
											</SelectItem>
											<SelectItem value="kubernetes.io/dockerconfigjson">
												Docker Config JSON
											</SelectItem>
											<SelectItem value="kubernetes.io/basic-auth">
												Basic Auth
											</SelectItem>
											<SelectItem value="kubernetes.io/ssh-auth">
												SSH Auth
											</SelectItem>
											<SelectItem value="kubernetes.io/tls">TLS</SelectItem>
										</SelectContent>
									</Select>
								)}
							</form.Field>
						</div>

						<div className="space-y-4">
							<h3 className="text-lg font-medium">Data</h3>
							<EnvEditor variables={dataVars} onChange={setDataVars} />
						</div>

						<div className="flex justify-end gap-4">
							<Link
								to={`/dashboard/cluster/$id/secrets`}
								params={{ id: clusterId }}
							>
								<Button variant="outline" type="button">
									Cancel
								</Button>
							</Link>
							<Button type="submit" disabled={mutation.isPending}>
								{mutation.isPending ? "Creating..." : "Create Secret"}
							</Button>
						</div>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
