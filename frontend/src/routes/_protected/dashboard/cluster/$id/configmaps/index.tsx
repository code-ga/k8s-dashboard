import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { FileJson, Settings } from "lucide-react";
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
import { api } from "@/lib/api";

export const Route = createFileRoute(
	"/_protected/dashboard/cluster/$id/configmaps/",
)({
	component: ClusterConfigMaps,
});

function ClusterConfigMaps() {
	const { id } = useParams({
		from: "/_protected/dashboard/cluster/$id/configmaps/",
	});
	const { can, isLoading: isLoadingPermissions } = usePermissions();

	const { data: configMaps, isLoading } = useQuery({
		queryKey: ["configmaps", id],
		queryFn: async () => {
			const res = can("configmap:manage")
				? await api.api.configmaps({ clusterId: id }).all.get()
				: await api.api.configmaps({ clusterId: id }).get();
			if (res.error) throw res.error;
			if (!res.data.data)
				throw new Error(res.data.message || "Failed to fetch config maps");
			return res.data.data;
		},
		enabled: can("configmap:read") || can("configmap:manage"),
	});

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

	if (isLoading)
		return (
			<div className="p-8 text-center text-muted-foreground animate-pulse font-medium tracking-tight">
				Loading config maps...
			</div>
		);

	return (
		<ResourcePageLayout
			title="ConfigMaps"
			subtitle="Non-confidential data storage"
			description="A ConfigMap is an API object used to store non-confidential data in key-value pairs. Pods can consume ConfigMaps as environment variables, command-line arguments, or as configuration files in a volume."
			helpLink="https://kubernetes.io/docs/concepts/configuration/configmap/"
			canCreate={can("configmap:create")}
			createLink="/dashboard/cluster/$id/configmaps/create"
			createLabel="Create ConfigMap"
		>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead className="px-6 py-4">Name</TableHead>
						<TableHead className="py-4">Namespace</TableHead>
						<TableHead className="py-4">Keys</TableHead>
						<TableHead className="py-4">Updated At</TableHead>
						<TableHead className="text-right px-6 py-4">Actions</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{configMaps?.map((cm: any) => (
						<TableRow key={cm.id} className="group">
							<TableCell className="font-medium px-6 py-4">
								<div className="flex items-center gap-2">
									<FileJson className="h-4 w-4 text-primary/70" />
									<span className="font-semibold">{cm.name}</span>
								</div>
							</TableCell>
							<TableCell>{cm.namespace}</TableCell>
							<TableCell>
								<span className="text-sm text-muted-foreground font-medium">
									{cm.data
										? Object.keys(JSON.parse(decryptPlaceholder(cm.data)))
												.length
										: 0}{" "}
									keys
								</span>
							</TableCell>
							<TableCell className="text-xs text-muted-foreground">
								{new Date(cm.updatedAt).toLocaleString()}
							</TableCell>
							<TableCell className="text-right px-6">
								<div className="flex justify-end gap-1">
									<Link
										to="/dashboard/cluster/$id/configmaps/$configmapId"
										params={{ id, configmapId: cm.id.toString() }}
									>
										<Button variant="ghost" size="sm" className="h-8 w-8">
											<Settings className="h-4 w-4" />
										</Button>
									</Link>
								</div>
							</TableCell>
						</TableRow>
					))}
					{(!configMaps || configMaps.length === 0) && (
						<TableRow>
							<TableCell
								colSpan={5}
								className="text-center py-24 text-muted-foreground/50"
							>
								<div className="flex flex-col items-center justify-center space-y-4">
									<FileJson className="h-12 w-12 opacity-20" />
									<p className="text-xl font-semibold text-foreground/70">
										No config maps found
									</p>
								</div>
							</TableCell>
						</TableRow>
					)}
				</TableBody>
			</Table>
		</ResourcePageLayout>
	);
}

function decryptPlaceholder(data: string) {
	try {
		if (data.startsWith("{")) return data;
		return "{}";
	} catch {
		return "{}";
	}
}
