import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, HardDrive, Plus, Trash2 } from "lucide-react";
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
			toast.error(
				res.error.value?.message || "Failed to delete PersistentVolume",
			);
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
						<h2 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
							Persistent Volumes
						</h2>
						<p className="text-muted-foreground font-medium">
							Manage cluster-wide storage resources
						</p>
					</div>
				</div>
				{can("pv:create") && (
					<Link
						to="/dashboard/cluster/$id/persistent-volumes/create"
						params={{ id }}
					>
						<Button className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 shadow-md transition-all active:scale-95">
							<Plus className="mr-2 h-4 w-4" /> Create PersistentVolume
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
								<TableHead className="font-semibold py-4">Capacity</TableHead>
								<TableHead className="font-semibold py-4">Status</TableHead>
								<TableHead className="font-semibold py-4">
									Storage Class
								</TableHead>
								<TableHead className="font-semibold py-4">
									Access Modes
								</TableHead>
								<TableHead className="font-semibold py-4">Claim</TableHead>
								<TableHead className="font-semibold py-4">Reclaim</TableHead>
								<TableHead className="text-right px-6 font-semibold py-4">
									Actions
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{pvs?.map((pv) => (
								<TableRow
									key={pv.id}
									className="hover:bg-accent/10 transition-colors group"
								>
									<TableCell className="font-medium px-6 py-4 flex items-center gap-3">
										<div className="p-2 bg-purple-100 rounded-lg group-hover:bg-purple-200 transition-colors">
											<HardDrive className="h-4 w-4 text-purple-600" />
										</div>
										<span className="font-semibold text-foreground/90">
											{pv.name}
										</span>
									</TableCell>
									<TableCell className="font-bold text-purple-600">
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
											)) || (
												<span className="text-muted-foreground text-xs">-</span>
											)}
										</div>
									</TableCell>
									<TableCell className="font-mono text-[10px] text-muted-foreground">
										{pv.boundPvc || <span className="opacity-30">Unbound</span>}
									</TableCell>
									<TableCell>
										<span className="text-sm text-muted-foreground">
											{pv.reclaimPolicy || "Delete"}
										</span>
									</TableCell>
									<TableCell className="text-right px-6">
										<div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all duration-200">
											{can("pv:delete") && (
												<Button
													variant="ghost"
													size="icon"
													className="h-8 w-8 text-destructive hover:bg-destructive/10"
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
											<div className="p-4 bg-muted/20 rounded-full animate-pulse">
												<HardDrive className="h-12 w-12 opacity-20" />
											</div>
											<div className="space-y-1">
												<p className="text-xl font-semibold tracking-tight text-foreground/70">
													No Persistent Volumes Found
												</p>
												<p className="max-w-[300px] mx-auto text-sm opacity-60">
													PersistentVolumes are cluster-wide storage resources.
													Create one manually or they'll be created
													automatically when PVCs are bound.
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
