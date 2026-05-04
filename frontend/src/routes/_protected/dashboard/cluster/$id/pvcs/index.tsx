import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { Database, Maximize2, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ResizePVCModal } from "@/components/cluster/pvc-resize-modal";
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

export const Route = createFileRoute("/_protected/dashboard/cluster/$id/pvcs/")(
	{
		component: ClusterPVCs,
	},
);

function ClusterPVCs() {
	const { id } = useParams({ from: "/_protected/dashboard/cluster/$id/pvcs/" });
	const { can, isLoading: isLoadingPermissions } = usePermissions();
	const [selectedPvc, setSelectedPvc] = useState<any>(null);
	const [isResizeModalOpen, setIsResizeModalOpen] = useState(false);

	const {
		data: pvcs,
		isLoading,
		refetch,
	} = useQuery({
		queryKey: ["pvcs", id],
		queryFn: async () => {
			const res = can("pvc:manage")
				? await api.api.pvcs({ clusterId: id }).all.get()
				: await api.api.pvcs({ clusterId: id }).get();
			if (res.error) throw res.error;
			if (!res.data.data)
				throw new Error(res.data.message || "Failed to fetch PVCs");
			return res.data.data;
		},
		enabled: can("pvc:read") || can("pvc:manage"),
	});

	const deletePvc = async (pvcId: number) => {
		if (!confirm("Are you sure you want to delete this PVC?")) return;
		const res = await api.api
			.pvcs({ clusterId: id })({ id: pvcId.toString() })
			.delete();
		if (res.error) {
			toast.error(getEdenErrorMessage(res.error));
		} else {
			toast.success("PVC deletion initiated");
			refetch();
		}
	};

	const openResizeModal = (pvc: any) => {
		setSelectedPvc(pvc);
		setIsResizeModalOpen(true);
	};

	if (!can("pvc:read") && !can("pvc:manage") && !isLoadingPermissions) {
		return (
			<div className="flex items-center justify-center py-12">
				<div className="text-center">
					<h2 className="text-xl font-semibold text-muted-foreground">
						Access Denied
					</h2>
					<p className="text-sm text-muted-foreground mt-2">
						You don't have permission to view PVCs.
					</p>
				</div>
			</div>
		);
	}

	if (isLoading)
		return (
			<div className="p-8 text-center text-muted-foreground animate-pulse font-medium tracking-tight">
				Accessing cluster storage...
			</div>
		);

	return (
		<ResourcePageLayout
			title="Persistent Volume Claims"
			subtitle="Manage storage volumes and claims for your applications"
			description="A PersistentVolumeClaim (PVC) is a request for storage by a user. It is similar to a Pod. Pods consume node resources and PVCs consume PV resources."
			helpLink="https://kubernetes.io/docs/concepts/storage/persistent-volumes/"
			canCreate={can("pvc:create")}
			createLink="/dashboard/cluster/$id/pvcs/create"
			createLabel="Create PVC"
		>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead className="px-6 py-4">Name</TableHead>
						<TableHead className="py-4">Namespace</TableHead>
						<TableHead className="py-4">Status</TableHead>
						<TableHead className="py-4">Volume</TableHead>
						<TableHead className="py-4">Capacity</TableHead>
						<TableHead className="py-4 text-center">Storage Class</TableHead>
						<TableHead className="text-right px-6 py-4">Actions</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{pvcs?.map((pvc) => (
						<TableRow key={pvc.id} className="group">
							<TableCell className="font-medium px-6 py-4">
								<div className="flex items-center gap-3">
									<Database className="h-4 w-4 text-primary/70" />
									<span className="font-semibold">{pvc.name}</span>
								</div>
							</TableCell>
							<TableCell>{pvc.namespace}</TableCell>
							<TableCell>
								<span
									className={`px-2.5 py-1 rounded-full text-[10px] font-bold ring-1 ring-inset ${
										pvc.phase === "Bound"
											? "bg-green-100 text-green-700 ring-green-600/20"
											: pvc.phase === "Pending"
												? "bg-yellow-100 text-yellow-700 ring-yellow-600/20"
												: "bg-red-100 text-red-700 ring-red-600/20"
									}`}
								>
									{pvc.phase}
								</span>
							</TableCell>
							<TableCell className="font-mono text-[10px] text-muted-foreground">
								{pvc.volumeName || (
									<span className="opacity-30 italic">Pending...</span>
								)}
							</TableCell>
							<TableCell className="font-bold text-foreground/80">
								{pvc.capacity}Mi
							</TableCell>
							<TableCell className="text-center">
								<code className="text-[11px] bg-muted px-2 py-1 rounded border border-border/50 font-mono text-muted-foreground">
									{pvc.storageClass || "default"}
								</code>
							</TableCell>
							<TableCell className="text-right px-6">
								<div className="flex justify-end gap-2">
									{(can("pvc:update") || can("pvc:manage")) &&
										pvc.phase === "Bound" && (
											<Button
												variant="ghost"
												size="icon"
												className="h-8 w-8 text-muted-foreground hover:text-primary transition-colors"
												title="Expand Storage"
												onClick={() => openResizeModal(pvc)}
											>
												<Maximize2 className="h-4 w-4" />
											</Button>
										)}
									{(can("pvc:delete") || can("pvc:manage")) && (
										<Button
											variant="ghost"
											size="icon"
											className="h-8 w-8 text-muted-foreground hover:text-destructive transition-colors"
											title="Delete Claim"
											onClick={() => deletePvc(pvc.id)}
										>
											<Trash2 className="h-4 w-4" />
										</Button>
									)}
								</div>
							</TableCell>
						</TableRow>
					))}
					{(!pvcs || pvcs.length === 0) && (
						<TableRow>
							<TableCell
								colSpan={7}
								className="text-center py-24 text-muted-foreground/50"
							>
								<div className="flex flex-col items-center justify-center space-y-4">
									<Database className="h-12 w-12 opacity-20" />
									<div className="space-y-1">
										<p className="text-xl font-semibold text-foreground/70">
											No Storage Claims Found
										</p>
										<p className="max-w-[250px] mx-auto text-sm opacity-60">
											Provisions persistable disk space for your pods by
											creating a new claim.
										</p>
									</div>
								</div>
							</TableCell>
						</TableRow>
					)}
				</TableBody>
			</Table>

			{selectedPvc && (
				<ResizePVCModal
					isOpen={isResizeModalOpen}
					onClose={() => setIsResizeModalOpen(false)}
					pvc={selectedPvc}
					clusterId={id}
					onSuccess={refetch}
				/>
			)}
		</ResourcePageLayout>
	);
}
