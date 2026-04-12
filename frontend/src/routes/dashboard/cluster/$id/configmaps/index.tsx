import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, FileJson, Plus, Settings } from "lucide-react";
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
import { useAllConfigMaps, useConfigMaps } from "@/hooks/queries";
import { usePermissions } from "@/hooks/use-permissions";

export const Route = createFileRoute("/dashboard/cluster/$id/configmaps/")({
	component: ClusterConfigMaps,
});

function ClusterConfigMaps() {
	const { id } = useParams({ from: "/dashboard/cluster/$id/configmaps/" });
	const { can, isLoading: isLoadingPermissions } = usePermissions();
	const numericId = Number(id);

	const { data: allConfigMaps } = useAllConfigMaps(numericId, {
		enabled: can("configmap:manage") && !!numericId,
	});

	const { data: userConfigMaps, isLoading } = useConfigMaps(numericId, {
		enabled: !can("configmap:manage") && can("configmap:read") && !!numericId,
	});

	const configMaps = can("configmap:manage") ? allConfigMaps : userConfigMaps;

	if (
		!can("configmap:read") &&
		!can("configmap:manage") &&
		!isLoadingPermissions
	) {
		return (
			<div className="flex items-center justify-center py-12">
				<div className="text-center">
					<h2 className="text-xl font-semibold text-muted-foreground">
						Access Denied
					</h2>
					<p className="text-sm text-muted-foreground mt-2">
						You don't have permission to view config maps.
					</p>
				</div>
			</div>
		);
	}

	if (isLoading) return <div>Loading config maps...</div>;

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
						<h2 className="text-3xl font-bold tracking-tight">ConfigMaps</h2>
						<p className="text-muted-foreground">
							List of config maps in this cluster
						</p>
					</div>
				</div>
				{can("configmap:create") && (
					<Link to="/dashboard/cluster/$id/configmaps/create" params={{ id }}>
						<Button>
							<Plus className="mr-2 h-4 w-4" /> Create ConfigMap
						</Button>
					</Link>
				)}
			</div>

			<Card>
				<CardContent className="p-0">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Name</TableHead>
								<TableHead>Namespace</TableHead>
								<TableHead>Keys</TableHead>
								<TableHead>Updated At</TableHead>
								<TableHead className="text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{configMaps?.map((cm: any) => (
								<TableRow key={cm.id}>
									<TableCell className="font-medium flex items-center gap-2">
										<FileJson className="h-4 w-4 text-blue-500" />
										{cm.name}
									</TableCell>
									<TableCell>{cm.namespace}</TableCell>
									<TableCell>
										{cm.data
											? Object.keys(JSON.parse(decryptPlaceholder(cm.data)))
													.length
											: 0}{" "}
										keys
									</TableCell>
									<TableCell>
										{new Date(cm.updatedAt).toLocaleString()}
									</TableCell>
									<TableCell className="text-right">
										<Link
											to="/dashboard/cluster/$id/configmaps/$configmapId"
											params={{ id, configmapId: cm.id.toString() }}
										>
											<Button variant="ghost" size="sm">
												<Settings className="h-4 w-4" />
											</Button>
										</Link>
									</TableCell>
								</TableRow>
							))}
							{(!configMaps || configMaps.length === 0) && (
								<TableRow>
									<TableCell colSpan={5} className="text-center py-4">
										No config maps found
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

// Helper to count keys without decrypting (backend should ideally provide count or list view shouldn't decrypt)
// For now, since list view data is masked/encrypted, we just show 0 or "Encrypted"
function decryptPlaceholder(data: string) {
	try {
		// If it starts with {, it's likely already parsed (shouldn't happen in list view if masked)
		if (data.startsWith("{")) return data;
		return "{}";
	} catch {
		return "{}";
	}
}
