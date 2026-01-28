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
import { ArrowLeft, Network } from "lucide-react";

export const Route = createFileRoute("/dashboard/cluster/$id/services")({
	component: ClusterServices,
});

function ClusterServices() {
	const { id } = useParams({ from: "/dashboard/cluster/$id/services" });

	const { data: services, isLoading } = useQuery({
		queryKey: ["services", id],
		queryFn: async () => {
			const res = await api.api.services({ clusterId: id }).get();
			if (res.error) throw res.error;
			if (!res.data.data)
				throw new Error(res.data.message || "Failed to fetch services");
			return res.data.data;
		},
	});

	if (isLoading) return <div>Loading services...</div>;

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-4">
				<Link to={`/dashboard/cluster/$id`} params={{ id }}>
					<Button variant="ghost" size="icon">
						<ArrowLeft className="h-4 w-4" />
					</Button>
				</Link>
				<div>
					<h2 className="text-3xl font-bold tracking-tight">Services</h2>
					<p className="text-muted-foreground">
						List of services in this cluster
					</p>
				</div>
			</div>

			<Card>
				<CardContent className="p-0">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Name</TableHead>
								<TableHead>Namespace</TableHead>
								<TableHead>Type</TableHead>
								<TableHead>Cluster IP</TableHead>
								<TableHead>Ports</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{services?.map((svc) => (
								<TableRow key={svc.id}>
									<TableCell className="font-medium flex items-center gap-2">
										<Network className="h-4 w-4 text-green-500" />
										{svc.name}
									</TableCell>
									<TableCell>{svc.namespace}</TableCell>
									<TableCell>{svc.type}</TableCell>
									<TableCell>{svc.clusterIp}</TableCell>
									<TableCell>
										{/* Display internal port and external port contextually */}
										{svc.internalPort}
										{svc.externalPort ? `:${svc.externalPort}` : ""}
									</TableCell>
								</TableRow>
							))}
							{(!services || services.length === 0) && (
								<TableRow>
									<TableCell colSpan={5} className="text-center py-4">
										No services found
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
