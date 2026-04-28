import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";
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
import { Switch } from "@/components/ui/switch";
import { usePermissions } from "@/hooks/use-permissions";
import { api, getEdenErrorMessage } from "@/lib/api";

export const Route = createFileRoute("/_protected/dashboard/cluster/$id/edit")({
	component: EditCluster,
});

function EditCluster() {
	const { id } = Route.useParams();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { can, isLoading: isLoadingPermissions } = usePermissions();

	const { data: cluster, isLoading } = useQuery({
		queryKey: ["cluster", id],
		queryFn: async () => {
			const res = await api.api.cluster({ id }).get();
			if (res.error) throw res.error;
			if (!res.data.data)
				throw new Error(res.data.message || "Failed to fetch cluster");
			return res.data.data;
		},
		enabled: can("cluster:update") || can("cluster:manage"),
	});

	const updateMutation = useMutation({
		mutationFn: async (values: {
			name: string;
			description: string;
			clusterDomain: string;
			tags: string;
			enableS3Service: boolean;
			acmeEmail: string;
		}) => {
			const res = await api.api.cluster({ id }).patch({
				name: values.name,
				description: values.description,
				clusterDomain: values.clusterDomain,
				tags: values.tags
					.split(",")
					.map((t) => t.trim())
					.filter(Boolean),
				enableS3Service: values.enableS3Service,
				acmeEmail: values.acmeEmail || null,
			})
			if (res.error) {
				throw new Error(getEdenErrorMessage(res.error));
			}
			return res.data;
		},
		onSuccess: () => {
			toast.success(
				"Cluster updated successfully. Redeploy agent to apply changes.",
			)
			queryClient.invalidateQueries({ queryKey: ["cluster", id] });
			navigate({ to: "/dashboard/cluster/$id", params: { id } });
		},
		onError: (error: Error) => {
			toast.error(error.message);
		},
	});

	const form = useForm({
		defaultValues: {
			name: cluster?.name || "",
			description: cluster?.description || "",
			clusterDomain: cluster?.clusterDomain || "",
			tags: cluster?.tags?.join(", ") || "",
			enableS3Service: cluster?.enableS3Service || false,
			acmeEmail: cluster?.acmeEmail || "",
		},
		onSubmit: async ({ value }) => {
			await updateMutation.mutateAsync(value);
		},
	});

	// Update form when cluster data loads
	if (cluster && !form.state.values.name) {
		form.setFieldValue("name", cluster.name);
		form.setFieldValue("description", cluster.description || "");
		form.setFieldValue("clusterDomain", cluster.clusterDomain);
		form.setFieldValue("tags", cluster.tags?.join(", ") || "");
		form.setFieldValue("enableS3Service", cluster.enableS3Service || false);
		form.setFieldValue("acmeEmail", cluster.acmeEmail || "");
	}

	if (
		!can("cluster:update") &&
		!can("cluster:manage") &&
		!isLoadingPermissions
	) {
		return (
			<div className="flex items-center justify-center py-12">
				<div className="text-center">
					<h2 className="text-xl font-semibold text-muted-foreground">
						Access Denied
					</h2>
					<p className="text-sm text-muted-foreground mt-2">
						You don't have permission to edit this cluster.
					</p>
				</div>
			</div>
		)
	}

	if (isLoading) return <div>Loading cluster...</div>;
	if (!cluster) return <div>Cluster not found</div>;

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-4">
				<Link to="/dashboard/cluster/$id" params={{ id }}>
					<Button variant="ghost" size="icon">
						<ArrowLeft className="h-4 w-4" />
					</Button>
				</Link>
				<div>
					<h1 className="text-4xl font-bold tracking-tight">Edit Cluster</h1>
					<p className="text-sm text-muted-foreground mt-1">
						Update cluster configuration
					</p>
				</div>
			</div>

			<form
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					form.handleSubmit();
				}}
			>
				<Card>
					<CardHeader>
						<CardTitle>Cluster Details</CardTitle>
						<CardDescription>
							Modify your cluster settings and configuration
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-6">
						<div className="space-y-2">
							<Label htmlFor="name">Cluster Name *</Label>
							<form.Field name="name">
								{(field) => (
									<>
										<Input
											id="name"
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											placeholder="Production Cluster"
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
							<Label htmlFor="description">Description</Label>
							<form.Field name="description">
								{(field) => (
									<Input
										id="description"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										placeholder="Main production Kubernetes cluster"
									/>
								)}
							</form.Field>
						</div>

						<div className="space-y-2">
							<Label htmlFor="clusterDomain">Cluster Domain *</Label>
							<form.Field name="clusterDomain">
								{(field) => (
									<>
										<Input
											id="clusterDomain"
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											placeholder="cluster.example.com"
										/>
										{field.state.meta.errors && (
											<p className="text-xs text-destructive">
												{field.state.meta.errors.join(", ")}
											</p>
										)}
										<p className="text-xs text-muted-foreground">
											Base domain for all services in this cluster
										</p>
									</>
								)}
							</form.Field>
						</div>

						<div className="space-y-2">
							<Label htmlFor="tags">Tags</Label>
							<form.Field name="tags">
								{(field) => (
									<>
										<Input
											id="tags"
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											placeholder="production, us-west-2"
										/>
										<p className="text-xs text-muted-foreground">
											Comma-separated tags for organization
										</p>
									</>
								)}
							</form.Field>
						</div>

						<div className="flex items-center justify-between">
							<div className="space-y-0.5">
								<Label htmlFor="enableS3Service">Enable S3 Service</Label>
								<p className="text-xs text-muted-foreground">
									Deploy MinIO S3-compatible storage
								</p>
							</div>
							<form.Field name="enableS3Service">
								{(field) => (
									<Switch
										id="enableS3Service"
										checked={field.state.value}
										onCheckedChange={(checked) => field.handleChange(checked)}
									/>
								)}
							</form.Field>
						</div>

						<div className="space-y-2">
							<Label htmlFor="acmeEmail">ACME Email (for Let's Encrypt)</Label>
							<form.Field name="acmeEmail">
								{(field) => (
									<>
										<Input
											id="acmeEmail"
											type="email"
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											placeholder="ops@example.com"
										/>
										{field.state.meta.errors && (
											<p className="text-xs text-destructive">
												{field.state.meta.errors.join(", ")}
											</p>
										)}
										<p className="text-xs text-muted-foreground">
											Email for automatic SSL certificate registration and
											notifications
										</p>
									</>
								)}
							</form.Field>
						</div>

						<div className="bg-yellow-500/10 border border-yellow-500/30 p-3 rounded-md">
							<p className="text-xs font-medium text-yellow-700 dark:text-yellow-500 mb-1">
								⚠️ Important
							</p>
							<ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
								<li>Changes to cluster domain may affect existing services</li>
								<li>ACME email changes require agent restart</li>
								<li>S3 service toggle requires cluster redeployment</li>
							</ul>
						</div>

						<div className="flex gap-3 justify-end pt-4">
							<Link to="/dashboard/cluster/$id" params={{ id }}>
								<Button type="button" variant="outline">
									Cancel
								</Button>
							</Link>
							<form.Subscribe
								selector={(state) => [state.canSubmit, state.isSubmitting]}
							>
								{([canSubmit, isSubmitting]) => (
									<Button
										type="submit"
										disabled={
											!canSubmit || isSubmitting || !can("cluster:manage")
										}
										className="gap-2"
									>
										<Save className="h-4 w-4" />
										{isSubmitting ? "Saving..." : "Save Changes"}
									</Button>
								)}
							</form.Subscribe>
						</div>
					</CardContent>
				</Card>
			</form>
		</div>
	)
}
