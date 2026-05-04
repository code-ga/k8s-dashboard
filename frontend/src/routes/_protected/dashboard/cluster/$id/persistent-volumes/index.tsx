import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { HardDrive, Trash2 } from "lucide-react";
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
	"/_protected/dashboard/cluster/$id/persistent-volumes/",
)({
	component: ClusterPersistentVolumes,
});

function formatCapacity(mib: number): string {
	if (mib >= 1024) {
		return `${(mib / 1024).toFixed(2)} GiB`;
	}
	return `${mib} MiB`;
}

function ClusterPersistentVolumes() {
	const { id } = useParams({
		from: "/_protected/dashboard/cluster/$id/persistent-volumes/",
	});
	const { can, isLoading: isLoadingPermissions } = usePermissions();

	const {
		data: pvs,
		isLoading,
		refetch,
	} = useQuery({
		queryKey: ["persistent-volumes", id],
		queryFn: async () => {
			const res = await api.api.pvs({ clusterId: id }).get();
			if (res.error) throw res.error;
			if (!res.data.data)
				throw new Error(
					res.data.message || "Failed to fetch PersistentVolumes",
				);
			return res.data.data;
		},
		enabled: can("pv:read") || can("pv:manage"),
	});

	const deletePV = async (pvId: number, name: string) => {
		if (!confirm(`Are you sure you want to delete PersistentVolume "${name}"?`))
			return;
		const res = await api.api
			.pvs({ clusterId: id })({ id: String(pvId) })
			.delete();
		if (res.error) {
			toast.error(getEdenErrorMessage(res.error));
		} else {
			toast.success("PersistentVolume deletion initiated");
			refetch();
		}
	};

	if (!can("pv:read") && !can("pv:manage") && !isLoadingPermissions) {
		return (
			<div className="flex items-center justify-center py-12">
				<div className="text-center">
					<h2 className="text-xl font-semibold text-muted-foreground">
						Access Denied
					</h2>
					<p className="text-sm text-muted-foreground mt-2">
						You don't have permission to view PersistentVolumes.
					</p>
				</div>
			</div>
		);
	}

	if (isLoading)
		return (
			<div className="p-8 text-center text-muted-foreground animate-pulse font-medium tracking-tight">
				Loading PersistentVolumes...
			</div>
		);

	return (
		<ResourcePageLayout
			title="Persistent Volumes"
			subtitle="Manage cluster-wide storage resources"
			description="A PersistentVolume (PV) is a piece of storage in the cluster that has been provisioned by an administrator or dynamically provisioned using Storage Classes."
			helpLink="https://kubernetes.io/docs/concepts/storage/persistent-volumes/"
			canCreate={can("pv:create")}
			createLink="/dashboard/cluster/$id/persistent-volumes/create"
			createLabel="Create PV"
		>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead className="px-6 py-4">Name</TableHead>
						<TableHead className="py-4 text-center">Capacity</TableHead>
						<TableHead className="py-4">Status</TableHead>
						<TableHead className="py-4">Storage Class</TableHead>
						<TableHead className="py-4">Access Modes</TableHead>
						<TableHead className="py-4">Claim</TableHead>
						<TableHead className="py-4">Reclaim</TableHead>
						<TableHead className="text-right px-6 py-4">Actions</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{pvs?.map((pv) => (
						<TableRow key={pv.id} className="group">
							<TableCell className="font-medium px-6 py-4">
								<div className="flex items-center gap-3">
									<HardDrive className="h-4 w-4 text-primary/70" />
									<span className="font-semibold">{pv.name}</span>
								</div>
							</TableCell>
							<TableCell className="font-bold text-foreground/80 text-center">
								{formatCapacity(pv.capacity)}
							</TableCell>
							<TableCell>
								<span
									className={`px-2.5 py-1 rounded-full text-[10px] font-bold ring-1 ring-inset ${
										pv.phase === "Bound"
											? "bg-green-100 text-green-700 ring-green-600/20"
											: pv.phase === "Available"
												? "bg-blue-100 text-blue-700 ring-blue-600/20"
												: "bg-red-100 text-red-700 ring-red-600/20"
									}`}
								>
									{pv.phase}
								</span>
							</TableCell>
							<TableCell>
								<code className="text-[11px] bg-muted px-2 py-1 rounded border border-border/50 font-mono text-muted-foreground">
									{pv.storageClass || "-"}
								</code>
							</TableCell>
							<TableCell>
								<div className="flex gap-1 flex-wrap">
									{pv.accessModes?.data?.map((mode: string) => (
										<span
											key={mode}
											className="px-1.5 py-0.5 bg-gray-100 text-gray-700 text-[9px] font-medium rounded"
										>
											{mode}
										</span>
									)) || <span className="text-muted-foreground text-xs">-</span>}
								</div>
							</TableCell>
							<TableCell className="font-mono text-[10px] text-muted-foreground">
								{pv.boundPvc || <span className="opacity-30 italic">Unbound</span>}
							</TableCell>
							<TableCell>
								<span className="text-sm text-muted-foreground">
									{pv.reclaimPolicy || "Delete"}
								</span>
							</TableCell>
							<TableCell className="text-right px-6">
								<div className="flex justify-end gap-2">
									{can("pv:delete") && (
										<Button
											variant="ghost"
											size="icon"
											className="h-8 w-8 text-muted-foreground hover:text-destructive transition-colors"
											title="Delete PersistentVolume"
											onClick={() => deletePV(pv.id, pv.name)}
										>
											<Trash2 className="h-4 w-4" />
										</Button>
									)}
								</div>
							</TableCell>
						</TableRow>
					))}
					{(!pvs || pvs.length === 0) && (
						<TableRow>
							<TableCell
								colSpan={8}
								className="text-center py-24 text-muted-foreground/50"
							>
								<div className="flex flex-col items-center justify-center space-y-4">
									<HardDrive className="h-12 w-12 opacity-20" />
									<div className="space-y-1">
										<p className="text-xl font-semibold text-foreground/70">
											No Persistent Volumes Found
										</p>
										<p className="max-w-[300px] mx-auto text-sm opacity-60">
											PersistentVolumes are cluster-wide storage resources.
											Create one manually or they'll be created automatically
											when PVCs are bound.
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
