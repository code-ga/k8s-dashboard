import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
// import { zodValidator } from "@tanstack/zod-form-adapter";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";

const clusterSchema = z.object({
	name: z.string().min(3, "Name must be at least 3 characters"),
	description: z.string().optional(),
	clusterDomain: z.string().min(3, "Domain must be at least 3 characters"),
	tags: z.string().optional(),
	enableS3Service: z.boolean().default(false),
	acmeEmail: z.string().email().optional(),
});

export function CreateClusterDialog() {
	const [open, setOpen] = useState(false);
	const queryClient = useQueryClient();

	const mutation = useMutation({
		mutationFn: async (values: z.infer<typeof clusterSchema>) => {
			const res = await api.api.cluster.post({
				name: values.name,
				description: values.description || "",
				tags: values.tags ? values.tags.split(",").map((t) => t.trim()) : [],
				clusterDomain: values.clusterDomain,
				enableS3Service: values.enableS3Service,
				acmeEmail: values.acmeEmail || undefined,
			});

			if (res.error) {
				const errorValue = res.error.value;
				const message =
					typeof errorValue === "object" && errorValue !== null && "message" in errorValue
						? (errorValue as { message: string }).message
						: String(errorValue);
				throw new Error(message || "Failed to create cluster");
			}

			return res.data;
		},
		onSuccess: () => {
			toast.success("Cluster created successfully");
			queryClient.invalidateQueries({ queryKey: ["clusters"] });
			setOpen(false);
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});

	const form = useForm({
		defaultValues: {
			name: "",
			description: "",
			clusterDomain: "",
			tags: "",
			enableS3Service: false,
			acmeEmail: "",
		},
		// validatorAdapter: zodValidator(),
		// validators: {
		// 	onChange: clusterSchema,
		// },
		onSubmit: async ({ value }) => {
			await mutation.mutateAsync(value);
		},
	});

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button>
					<Plus className="mr-2 h-4 w-4" /> Create Cluster
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle>Create Cluster</DialogTitle>
					<DialogDescription>
						Add a new Kubernetes cluster to your dashboard.
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
						<Label htmlFor="name">Cluster Name</Label>
						<form.Field name="name">
							{(field) => (
								<>
									<Input
										id="name"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										placeholder="my-production-cluster"
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
						<Label htmlFor="clusterDomain">Cluster Domain</Label>
						<form.Field name="clusterDomain">
							{(field) => (
								<>
									<Input
										id="clusterDomain"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										placeholder="cluster.local"
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
								<Textarea
									id="description"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
									placeholder="Optional description"
								/>
							)}
						</form.Field>
					</div>
					<div className="space-y-2">
						<Label htmlFor="tags">Tags (comma separated)</Label>
						<form.Field name="tags">
							{(field) => (
								<Input
									id="tags"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
									placeholder="prod, aws, k8s"
								/>
							)}
						</form.Field>
					</div>
					<div className="flex items-center justify-between">
						<Label htmlFor="enableS3Service">Enable S3 Service</Label>
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
										Optional: Email for automatic SSL certificate registration
									</p>
								</>
							)}
						</form.Field>
					</div>
					<DialogFooter>
						<Button type="submit" disabled={mutation.isPending}>
							{mutation.isPending ? "Creating..." : "Create Cluster"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
