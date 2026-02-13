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

export const Route = createFileRoute(
	"/dashboard/cluster/$id/configmaps/create",
)({
	component: CreateConfigMapPage,
});

const configMapSchema = z.object({
	name: z
		.string()
		.min(1, "Name is required")
		.max(253, "Name must be less than 253 characters"),
	namespace: z.string().min(1, "Namespace is required"),
});

function CreateConfigMapPage() {
	const { id: clusterId } = useParams({
		from: "/dashboard/cluster/$id/configmaps/create",
	});
	const navigate = useNavigate();
	const [dataVars, setDataVars] = useState<EnvVar[]>([]);

	const mutation = useMutation({
		mutationFn: async (values: z.infer<typeof configMapSchema>) => {
			const data: Record<string, string> = {};
			for (const v of dataVars) {
				if (v.name) data[v.name] = v.value;
			}

			const res = await api.api.configmaps({ clusterId }).post({
				name: values.name,
				namespace: values.namespace,
				data,
			});

			if (res.error) {
				throw new Error(
					res.error.value?.message || "Failed to create ConfigMap",
				);
			}

			return res.data;
		},
		onSuccess: () => {
			toast.success("ConfigMap created successfully");
			navigate({
				to: `/dashboard/cluster/$id/configmaps`,
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
		},
		onSubmit: async ({ value }) => {
			await mutation.mutateAsync(value);
		},
	});

	return (
		<div className="max-w-4xl mx-auto space-y-6">
			<div className="flex items-center gap-4">
				<Link
					to={`/dashboard/cluster/$id/configmaps`}
					params={{ id: clusterId }}
				>
					<Button variant="ghost" size="icon">
						<ArrowLeft className="h-4 w-4" />
					</Button>
				</Link>
				<div>
					<h2 className="text-3xl font-bold tracking-tight">
						Create ConfigMap
					</h2>
					<p className="text-muted-foreground">
						Create a new ConfigMap for storing configuration data.
					</p>
				</div>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>ConfigMap Configuration</CardTitle>
					<CardDescription>
						Provide a name, namespace, and key-value pairs for the ConfigMap.
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
												placeholder="my-config"
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

						<div className="space-y-4">
							<h3 className="text-lg font-medium">Data</h3>
							<EnvEditor variables={dataVars} onChange={setDataVars} />
						</div>

						<div className="flex justify-end gap-4">
							<Link
								to={`/dashboard/cluster/$id/configmaps`}
								params={{ id: clusterId }}
							>
								<Button variant="outline" type="button">
									Cancel
								</Button>
							</Link>
							<Button type="submit" disabled={mutation.isPending}>
								{mutation.isPending ? "Creating..." : "Create ConfigMap"}
							</Button>
						</div>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
