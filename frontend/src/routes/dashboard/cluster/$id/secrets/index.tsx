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
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, Lock, Plus, Settings } from "lucide-react";

export const Route = createFileRoute("/dashboard/cluster/$id/secrets/")({
	component: ClusterSecrets,
});

function ClusterSecrets() {
	const { id } = useParams({ from: "/dashboard/cluster/$id/secrets/" });

	const { data: secrets, isLoading } = useQuery({
		queryKey: ["secrets", id],
		queryFn: async () => {
			const res = await api.api.secrets({ clusterId: id }).get();
			if (res.error) throw res.error;
			if (!res.data.data)
				throw new Error(res.data.message || "Failed to fetch secrets");
			return res.data.data as any[];
		},
	});

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
	);
}
