import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, Lock, Plus, Settings } from "lucide-react";
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

export const Route = createFileRoute("/_protected/dashboard/cluster/$id/secrets/")({
	component: ClusterSecrets,
});

function ClusterSecrets() {
	const { id } = useParams({ from: "/_protected/dashboard/cluster/$id/secrets/" });
	const { can, isLoading: isLoadingPermissions } = usePermissions();

	const { data: secrets, isLoading } = useQuery({
		queryKey: ["secrets", id],
		queryFn: async () => {
			const res = can("secret:manage")
				? await api.api.secrets({ clusterId: id }).all.get()
				: await api.api.secrets({ clusterId: id }).get();
			if (res.error) throw res.error;
			if (!res.data.data)
				throw new Error(res.data.message || "Failed to fetch secrets");
			return res.data.data;
		},
		enabled: can("secret:read") || can("secret:manage"),
	});

	if (!can("secret:read") && !can("secret:manage") && !isLoadingPermissions) {
		return (
			<div className="flex items-center justify-center py-12">
				<div className="text-center">
					<h2 className="text-xl font-semibold text-muted-foreground">
						Access Denied
					</h2>
					<p className="text-sm text-muted-foreground mt-2">
						You don't have permission to view secrets.
					</p>
				</div>
			</div>
		)
	}

	if (isLoading) return <div>Loading secrets...</div>;

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
						<h2 className="text-3xl font-bold tracking-tight">Secrets</h2>
						<p className="text-muted-foreground">
							List of secrets in this cluster
						</p>
					</div>
				</div>
				<Link to="/dashboard/cluster/$id/secrets/create" params={{ id }}>
					<Button>
						<Plus className="mr-2 h-4 w-4" /> Create Secret
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
								<TableHead>Type</TableHead>
								<TableHead>Updated At</TableHead>
								<TableHead className="text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{secrets?.map((secret: any) => (
								<TableRow key={secret.id}>
									<TableCell className="font-medium flex items-center gap-2">
										<Lock className="h-4 w-4 text-yellow-500" />
										{secret.name}
									</TableCell>
									<TableCell>{secret.namespace}</TableCell>
									<TableCell>{secret.type || "Opaque"}</TableCell>
									<TableCell>
										{new Date(secret.updatedAt).toLocaleString()}
									</TableCell>
									<TableCell className="text-right">
										<Link
											to="/dashboard/cluster/$id/secrets/$secretId"
											params={{ id, secretId: secret.id.toString() }}
										>
											<Button variant="ghost" size="sm">
												<Settings className="h-4 w-4" />
											</Button>
										</Link>
									</TableCell>
								</TableRow>
							))}
							{(!secrets || secrets.length === 0) && (
								<TableRow>
									<TableCell colSpan={5} className="text-center py-4">
										No secrets found
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
		</div>
	)
}
