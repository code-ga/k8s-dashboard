import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { Lock, Settings } from "lucide-react";
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
	"/_protected/dashboard/cluster/$id/secrets/",
)({
	component: ClusterSecrets,
});

function ClusterSecrets() {
	const { id } = useParams({
		from: "/_protected/dashboard/cluster/$id/secrets/",
	});
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
		);
	}

	if (isLoading)
		return (
			<div className="p-8 text-center text-muted-foreground animate-pulse font-medium tracking-tight">
				Loading secrets...
			</div>
		);

	return (
		<ResourcePageLayout
			title="Secrets"
			subtitle="Sensitive data management"
			description="A Secret is an object that contains a small amount of sensitive data such as a password, a token, or a key. Such information might otherwise be put in a Pod specification or in a container image."
			helpLink="https://kubernetes.io/docs/concepts/configuration/secret/"
			canCreate={can("secret:create")}
			createLink="/dashboard/cluster/$id/secrets/create"
			createLabel="Create Secret"
		>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead className="px-6 py-4">Name</TableHead>
						<TableHead className="py-4">Namespace</TableHead>
						<TableHead className="py-4">Type</TableHead>
						<TableHead className="py-4">Updated At</TableHead>
						<TableHead className="text-right px-6 py-4">Actions</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{secrets?.map((secret: any) => (
						<TableRow key={secret.id} className="group">
							<TableCell className="font-medium px-6 py-4">
								<div className="flex items-center gap-2">
									<Lock className="h-4 w-4 text-primary/70" />
									<span className="font-semibold">{secret.name}</span>
								</div>
							</TableCell>
							<TableCell>{secret.namespace}</TableCell>
							<TableCell>
								<span className="text-xs text-muted-foreground font-medium">
									{secret.type || "Opaque"}
								</span>
							</TableCell>
							<TableCell className="text-xs text-muted-foreground">
								{new Date(secret.updatedAt).toLocaleString()}
							</TableCell>
							<TableCell className="text-right px-6">
								<div className="flex justify-end gap-1">
									<Link
										to="/dashboard/cluster/$id/secrets/$secretId"
										params={{ id, secretId: secret.id.toString() }}
									>
										<Button variant="ghost" size="sm" className="h-8 w-8">
											<Settings className="h-4 w-4" />
										</Button>
									</Link>
								</div>
							</TableCell>
						</TableRow>
					))}
					{(!secrets || secrets.length === 0) && (
						<TableRow>
							<TableCell
								colSpan={5}
								className="text-center py-24 text-muted-foreground/50"
							>
								<div className="flex flex-col items-center justify-center space-y-4">
									<Lock className="h-12 w-12 opacity-20" />
									<p className="text-xl font-semibold text-foreground/70">
										No secrets found
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
