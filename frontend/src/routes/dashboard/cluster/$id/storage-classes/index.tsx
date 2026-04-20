import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, HardDrive, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { usePermissions } from "@/hooks/use-permissions";
import { api } from "@/lib/api";

export const Route = createFileRoute("/dashboard/cluster/$id/storage-classes/")(
	{
		component: ClusterStorageClasses,
	},
);

function ClusterStorageClasses() {
	const { id } = useParams({ from: "/dashboard/cluster/$id/storage-classes/" });
	const { can, isLoading: isLoadingPermissions } = usePermissions();
	const queryClient = useQueryClient();

	const {
		data: storageClasses,
		isLoading,
		refetch,
	} = useQuery({
		queryKey: ["storage-classes", id],
		queryFn: async () => {
			const res = await api.api.storageclasses({ clusterId: id }).get();
			if (res.error) throw res.error;
			if (!res.data.data)
				throw new Error(res.data.message || "Failed to fetch StorageClasses");
			return res.data.data;
		},
		enabled: can("storageclass:read") || can("storageclass:manage"),
	});

	const setDefaultMutation = useMutation({
		mutationFn: async (scId: number) => {
			const res = await api.api
				.storageclasses({ clusterId: id })({ id: String(scId) })
				["set-default"].patch({ isDefault: true });
			if (res.error) throw res.error;
			return res.data;
		},
		onSuccess: () => {
			toast.success("Default StorageClass updated");
			queryClient.invalidateQueries({ queryKey: ["storage-classes", id] });
		},
		onError: (error: any) => {
			toast.error(error?.message || "Failed to set default StorageClass");
		},
	});

	const deleteStorageClass = async (scId: number, name: string) => {
		if (!confirm(`Are you sure you want to delete StorageClass "${name}"?`))
			return;
		const res = await api.api
			.storageclasses({ clusterId: id })({ id: String(scId) })
			.delete();
		if (res.error) {
			toast.error(res.error.value?.message || "Failed to delete StorageClass");
		} else {
			toast.success("StorageClass deletion initiated");
			refetch();
		}
	};

	const setDefault = (scId: number) => {
		setDefaultMutation.mutate(scId);
	};

	if (
		!can("storageclass:read") &&
		!can("storageclass:manage") &&
		!isLoadingPermissions
	) {
		return (
			<div className="flex items-center justify-center py-12">
				<div className="text-center">
					<h2 className="text-xl font-semibold text-muted-foreground">
						Access Denied
					</h2>
					<p className="text-sm text-muted-foreground mt-2">
						You don't have permission to view StorageClasses.
					</p>
				</div>
			</div>
		);
	}

	if (isLoading)
		return (
			<div className="p-8 text-center text-muted-foreground animate-pulse font-medium tracking-tight">
				Loading StorageClasses...
			</div>
		);

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-4">
					<Link to={`/dashboard/cluster/$id`} params={{ id }}>
						<Button
							variant="ghost"
							size="icon"
							className="hover:bg-accent/50 transition-colors"
						>
							<ArrowLeft className="h-4 w-4" />
						</Button>
					</Link>
					<div>
						<h2 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
							Storage Classes
						</h2>
						<p className="text-muted-foreground font-medium">
							Define how storage is provisioned in your cluster
						</p>
					</div>
				</div>
				{can("storageclass:create") && (
					<Link
						to="/dashboard/cluster/$id/storage-classes/create"
						params={{ id }}
					>
						<Button className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 shadow-md transition-all active:scale-95">
							<Plus className="mr-2 h-4 w-4" /> Create StorageClass
						</Button>
					</Link>
				)}
			</div>

			<Card className="border-none shadow-xl bg-card/50 backdrop-blur-sm overflow-hidden min-h-[400px]">
				<CardContent className="p-0">
					<Table>
						<TableHeader className="bg-muted/50 border-b border-border/50">
							<TableRow>
								<TableHead className="font-semibold px-6 py-4">Name</TableHead>
								<TableHead className="font-semibold py-4">
									Provisioner
								</TableHead>
								<TableHead className="font-semibold py-4">
									Reclaim Policy
								</TableHead>
								<TableHead className="font-semibold py-4">
									Volume Binding
								</TableHead>
								<TableHead className="font-semibold py-4">
									Expand Volume
								</TableHead>
								<TableHead className="text-right px-6 font-semibold py-4">
									Actions
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{storageClasses?.map((sc) => (
								<TableRow
									key={sc.id}
									className="hover:bg-accent/10 transition-colors group"
								>
									<TableCell className="font-medium px-6 py-4 flex items-center gap-3">
										<div className="p-2 bg-amber-100 rounded-lg group-hover:bg-amber-200 transition-colors">
											<HardDrive className="h-4 w-4 text-amber-600" />
										</div>
										<span className="font-semibold text-foreground/90">
											{sc.name}
										</span>
										{sc.isDefault && (
											<span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded-full flex items-center gap-1">
												<Star className="h-3 w-3" /> Default
											</span>
										)}
									</TableCell>
									<TableCell>
										<code className="text-[11px] bg-muted px-2 py-1 rounded border border-border/50 font-mono text-muted-foreground">
											{sc.provisioner}
										</code>
									</TableCell>
									<TableCell>
										<span className="px-2.5 py-1 rounded-full text-[10px] font-bold ring-1 ring-inset bg-slate-100 text-slate-700 ring-slate-600/20">
											{sc.reclaimPolicy || "Delete"}
										</span>
									</TableCell>
									<TableCell>
										<span className="text-sm text-muted-foreground">
											{sc.volumeBindingMode || "Immediate"}
										</span>
									</TableCell>
									<TableCell>
										<span
											className={`px-2.5 py-1 rounded-full text-[10px] font-bold ring-1 ring-inset ${
												sc.allowVolumeExpansion
													? "bg-green-100 text-green-700 ring-green-600/20"
													: "bg-gray-100 text-gray-700 ring-gray-600/20"
											}`}
										>
											{sc.allowVolumeExpansion ? "Yes" : "No"}
										</span>
									</TableCell>
									<TableCell className="text-right px-6">
										<div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all duration-200">
											{!sc.isDefault && can("storageclass:update") && (
												<Button
													variant="ghost"
													size="icon"
													className="h-8 w-8 text-amber-600 hover:bg-amber-100"
													title="Set as Default"
													onClick={() => setDefault(sc.id)}
													disabled={setDefaultMutation.isPending}
												>
													<Star className="h-4 w-4" />
												</Button>
											)}
											{can("storageclass:delete") && (
												<Button
													variant="ghost"
													size="icon"
													className="h-8 w-8 text-destructive hover:bg-destructive/10"
													title="Delete StorageClass"
													onClick={() => deleteStorageClass(sc.id, sc.name)}
												>
													<Trash2 className="h-4 w-4" />
												</Button>
											)}
										</div>
									</TableCell>
								</TableRow>
							))}
							{(!storageClasses || storageClasses.length === 0) && (
								<TableRow>
									<TableCell
										colSpan={6}
										className="text-center py-24 text-muted-foreground/50"
									>
										<div className="flex flex-col items-center justify-center space-y-4">
											<div className="p-4 bg-muted/20 rounded-full animate-pulse">
												<HardDrive className="h-12 w-12 opacity-20" />
											</div>
											<div className="space-y-1">
												<p className="text-xl font-semibold tracking-tight text-foreground/70">
													No Storage Classes Found
												</p>
												<p className="max-w-[300px] mx-auto text-sm opacity-60">
													Storage classes define how storage is provisioned.
													Create one to enable dynamic volume provisioning.
												</p>
											</div>
										</div>
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
