import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { HardDrive, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ResourcePageLayout } from "@/components/shared/resource-page-layout";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { usePermissions } from "@/hooks/use-permissions";
import { api, getEdenErrorMessage } from "@/lib/api";

export const Route = createFileRoute(
	"/_protected/dashboard/cluster/$id/storage-classes/",
)({
	component: ClusterStorageClasses,
});

function ClusterStorageClasses() {
	const { id } = useParams({
		from: "/_protected/dashboard/cluster/$id/storage-classes/",
	});
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
			toast.error(getEdenErrorMessage(error));
		},
	});

	const deleteStorageClass = async (scId: number, name: string) => {
		if (!confirm(`Are you sure you want to delete StorageClass "${name}"?`))
			return;
		const res = await api.api
			.storageclasses({ clusterId: id })({ id: String(scId) })
			.delete();
		if (res.error) {
			toast.error(getEdenErrorMessage(res.error));
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
		<ResourcePageLayout
			title="Storage Classes"
			subtitle="Define how storage is provisioned in your cluster"
			description="A StorageClass provides a way for administrators to describe the 'classes' of storage they offer. Different classes might map to quality-of-service levels, or to backup policies, or to arbitrary policies determined by the cluster administrators."
			helpLink="https://kubernetes.io/docs/concepts/storage/storage-classes/"
			canCreate={can("storageclass:create")}
			createLink="/dashboard/cluster/$id/storage-classes/create"
			createLabel="Create StorageClass"
		>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead className="px-6 py-4">Name</TableHead>
						<TableHead className="py-4">Provisioner</TableHead>
						<TableHead className="py-4">Reclaim Policy</TableHead>
						<TableHead className="py-4">Volume Binding</TableHead>
						<TableHead className="py-4 text-center">Expand Volume</TableHead>
						<TableHead className="text-right px-6 py-4">Actions</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{storageClasses?.map((sc) => (
						<TableRow key={sc.id} className="group">
							<TableCell className="font-medium px-6 py-4">
								<div className="flex items-center gap-3">
									<HardDrive className="h-4 w-4 text-primary/70" />
									<span className="font-semibold">{sc.name}</span>
									{sc.isDefault && (
										<span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded-full flex items-center gap-1">
											<Star className="h-3 w-3 fill-current" /> Default
										</span>
									)}
								</div>
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
							<TableCell className="text-center">
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
								<div className="flex justify-end gap-2">
									{!sc.isDefault && can("storageclass:update") && (
										<Button
											variant="ghost"
											size="icon"
											className="h-8 w-8 text-muted-foreground hover:text-primary transition-colors"
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
											className="h-8 w-8 text-muted-foreground hover:text-destructive transition-colors"
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
									<HardDrive className="h-12 w-12 opacity-20" />
									<div className="space-y-1">
										<p className="text-xl font-semibold text-foreground/70">
											No Storage Classes Found
										</p>
										<p className="max-w-[300px] mx-auto text-sm opacity-60">
											Storage classes define how storage is provisioned. Create
											one to enable dynamic volume provisioning.
										</p>
									</div>
								</div>
							</TableCell>
						</TableRow>
					)}
				</TableBody>
			</Table>
		</ResourcePageLayout>
	);
}
