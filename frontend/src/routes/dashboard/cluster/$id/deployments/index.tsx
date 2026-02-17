import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import {
	ArrowLeft,
	Layers,
	Plus,
	Settings,
	Settings2,
	ShieldCheck,
	Zap,
	ZapOff,
} from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { databaseTypes, SchemaStatic } from "@/lib/api";
import { api } from "@/lib/api";

export const Route = createFileRoute("/dashboard/cluster/$id/deployments/")({
	component: ClusterDeployments,
});

type Deployment = SchemaStatic<databaseTypes.databaseTypes["k8sDeployments"]>;

function ScaleSettingsDialog({
	deployment,
	clusterId,
}: {
	deployment: Deployment;
	clusterId: string;
}) {
	const [open, setOpen] = useState(false);
	const queryClient = useQueryClient();

	const form = useForm({
		defaultValues: {
			isAutoScaling: deployment.isAutoScaling,
			isAlwaysRunning: deployment.isAlwaysRunning,
			idleTimeoutSeconds: deployment.idleTimeoutSeconds || 300,
		},
	});

	const mutation = useMutation({
		mutationFn: async (values: {
			isAutoScaling?: boolean;
			isAlwaysRunning?: boolean;
			idleTimeoutSeconds?: number;
		}) => {
			// Updating deployment scale settings
			const res = await api.api
				.deployments({ clusterId })({ id: deployment.id })
				.patch(values);
			if (res.error) throw res.error;
			if (!res.data.data)
				throw new Error(res.data.message || "Failed to update settings");
			return res.data.data;
		},
		onSuccess: () => {
			toast.success("Scale settings updated");
			queryClient.invalidateQueries({ queryKey: ["deployments", clusterId] });
			setOpen(false);
		},
		onError: (error: Error) => {
			toast.error(error.message || "Failed to update settings");
		},
	});

	const isAutoScaling = form.watch("isAutoScaling");
	const isAlwaysRunning = form.watch("isAlwaysRunning");

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="ghost" size="icon">
					<Settings2 className="h-4 w-4" />
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Scale Settings: {deployment.name}</DialogTitle>
					<DialogDescription>
						Configure Scale-to-Zero or High-Availability behavior for this
						deployment.
					</DialogDescription>
				</DialogHeader>

				<Form {...form}>
					<form
						onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
						className="space-y-6"
					>
						<FormField
							control={form.control}
							name="isAutoScaling"
							render={({ field }) => (
								<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
									<div className="space-y-0.5">
										<FormLabel className="text-base">
											Enable Auto-Scaling
										</FormLabel>
										<FormDescription>
											Scale to 0 replicas when the deployment is idle.
										</FormDescription>
									</div>
									<FormControl>
										<Switch
											checked={field.value}
											disabled={isAlwaysRunning}
											onCheckedChange={(val) => {
												field.onChange(val);
												if (val) form.setValue("isAlwaysRunning", false);
											}}
										/>
									</FormControl>
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="isAlwaysRunning"
							render={({ field }) => (
								<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
									<div className="space-y-0.5">
										<FormLabel className="text-base">Always Running</FormLabel>
										<FormDescription>
											Ensure at least 1 replica is always running.
										</FormDescription>
									</div>
									<FormControl>
										<Switch
											checked={field.value}
											disabled={isAutoScaling}
											onCheckedChange={(val) => {
												field.onChange(val);
												if (val) form.setValue("isAutoScaling", false);
											}}
										/>
									</FormControl>
								</FormItem>
							)}
						/>

						{isAutoScaling && (
							<FormField
								control={form.control}
								name="idleTimeoutSeconds"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Idle Timeout (seconds)</FormLabel>
										<FormControl>
											<Input
												type="number"
												{...field}
												onChange={(e) => field.onChange(Number(e.target.value))}
											/>
										</FormControl>
										<FormDescription>
											Duration of inactivity before scaling to zero.
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
						)}

						<DialogFooter>
							<Button type="submit" disabled={mutation.isPending}>
								Save Changes
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";

function ClusterDeployments() {
	const { id } = useParams({ from: "/dashboard/cluster/$id/deployments/" });

	const { data: deployments, isLoading } = useQuery({
		queryKey: ["deployments", id],
		queryFn: async () => {
			const res = await api.api.deployments({ clusterId: id }).get();
			if (res.error) throw res.error;
			if (!res.data.data)
				throw new Error(res.data.message || "Failed to fetch deployments");
			return res.data.data as Deployment[];
		},
	});

	if (isLoading) return <div>Loading deployments...</div>;

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-4">
					<Link to={`/dashboard/cluster/$id`} params={{ id }}>
						<Button variant="ghost" size="icon">
							<ArrowLeft className="h-4 w-4" />
						</Button>
					</Link>
					<div>
						<h2 className="text-3xl font-bold tracking-tight">Deployments</h2>
						<p className="text-muted-foreground">
							List of deployments in this cluster
						</p>
					</div>
				</div>
				<Link to="/dashboard/cluster/$id/deployments/create" params={{ id }}>
					<Button>
						<Plus className="mr-2 h-4 w-4" /> Create Deployment
					</Button>
				</Link>
			</div>

			<Card>
				<CardContent className="p-0">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Name</TableHead>
								<TableHead>Namespace</TableHead>
								<TableHead>Replicas</TableHead>
								<TableHead>Auto-Scaling</TableHead>
								<TableHead>Image</TableHead>
								<TableHead className="text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{deployments?.map((dep) => (
								<TableRow key={dep.id}>
									<TableCell className="font-medium flex items-center gap-2">
										<Layers className="h-4 w-4 text-blue-500" />
										{dep.name}
									</TableCell>
									<TableCell>{dep.namespace}</TableCell>
									<TableCell>
										{dep.availableReplicas} / {dep.replicas}
									</TableCell>
									<TableCell>
										{dep.isAlwaysRunning ? (
											<div className="flex items-center gap-2 text-blue-600 font-medium whitespace-nowrap">
												<ShieldCheck className="h-4 w-4" />
												Always Running
											</div>
										) : dep.isAutoScaling ? (
											<div className="flex items-center gap-2 text-green-600 font-medium whitespace-nowrap">
												<Zap className="h-4 w-4" />
												Active ({dep.idleTimeoutSeconds}s)
											</div>
										) : (
											<div className="flex items-center gap-2 text-muted-foreground whitespace-nowrap">
												<ZapOff className="h-4 w-4" />
												Disabled
											</div>
										)}
									</TableCell>
									<TableCell
										className="max-w-[200px] truncate"
										title={dep.dockerImage || ""}
									>
										{dep.dockerImage}
									</TableCell>
									<TableCell className="text-right space-x-1">
										<Link
											to="/dashboard/cluster/$id/deployments/$deploymentId"
											params={{ id, deploymentId: dep.id.toString() }}
										>
											<Button variant="ghost" size="sm">
												<Settings className="h-4 w-4" />
											</Button>
										</Link>
										<ScaleSettingsDialog deployment={dep} clusterId={id} />
									</TableCell>
								</TableRow>
							))}
							{(!deployments || deployments.length === 0) && (
								<TableRow>
									<TableCell colSpan={6} className="text-center py-4">
										No deployments found
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
		</div>
	);
}
