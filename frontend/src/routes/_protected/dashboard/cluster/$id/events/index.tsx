import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useState } from "react";
import { ResourcePageLayout } from "@/components/shared/resource-page-layout";
import { Input } from "@/components/ui/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api, getEdenErrorMessage } from "@/lib/api";

export const Route = createFileRoute(
	"/_protected/dashboard/cluster/$id/events/",
)({
	component: ClusterEvents,
});

function ClusterEvents() {
	const { id: clusterId } = useParams({
		from: "/_protected/dashboard/cluster/$id/events/",
	});
	const [searchQuery, setSearchQuery] = useState("");

	const {
		data: events,
		isLoading,
		error,
	} = useQuery({
		queryKey: ["cluster-events", clusterId],
		queryFn: async () => {
			const res = await api.api.cluster({ id: clusterId }).events.get();
			if (res.error) throw res.error;
			return res.data.data;
		},
	});

	if (isLoading)
		return (
			<div className="p-8 text-center text-muted-foreground animate-pulse font-medium tracking-tight">
				Loading cluster events...
			</div>
		);

	if (error)
		return (
			<div className="p-12 flex flex-col items-center justify-center space-y-4">
				<div className="text-destructive font-bold tracking-tight text-xl">
					Failed to load events
				</div>
				<div className="text-sm text-muted-foreground bg-muted p-4 rounded-lg border">
					{getEdenErrorMessage(error)}
				</div>
			</div>
		);

	const filteredEvents = (events || []).filter((e: any) => {
		const searchLower = searchQuery.toLowerCase();
		return (
			e.message.toLowerCase().includes(searchLower) ||
			e.reason.toLowerCase().includes(searchLower) ||
			e.object.toLowerCase().includes(searchLower) ||
			e.namespace.toLowerCase().includes(searchLower)
		);
	});

	return (
		<ResourcePageLayout
			title="Cluster Events"
			subtitle="Real-time activity audit"
			description="Events in Kubernetes are objects that provide insight into what is happening inside a cluster, such as what decisions the Scheduler made or why some Pods were evicted from a node."
			helpLink="https://kubernetes.io/docs/reference/kubernetes-api/cluster-resources/event-v1/"
		>
			<div className="p-4 border-b bg-muted/20">
				<div className="relative max-w-md">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
					<Input
						placeholder="Search events (object, message, namespace...)"
						className="pl-9 h-10 shadow-sm border-muted-foreground/20 focus-visible:ring-primary/20"
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
					/>
				</div>
			</div>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead className="px-6 py-4 w-[180px]">Last Seen</TableHead>
						<TableHead className="py-4 w-[120px]">Namespace</TableHead>
						<TableHead className="py-4 w-[100px]">Type</TableHead>
						<TableHead className="py-4 w-[150px]">Reason</TableHead>
						<TableHead className="py-4 w-[200px]">Involved Object</TableHead>
						<TableHead className="px-6 py-4">Message</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{filteredEvents.length === 0 ? (
						<TableRow>
							<TableCell
								colSpan={6}
								className="text-center py-24 text-muted-foreground/50"
							>
								<div className="flex flex-col items-center justify-center space-y-4">
									<Search className="h-12 w-12 opacity-20" />
									<p className="text-xl font-semibold text-foreground/70">
										{searchQuery
											? "No events match your search"
											: "No recent events found"}
									</p>
								</div>
							</TableCell>
						</TableRow>
					) : (
						filteredEvents.map((e: any, i: number) => (
							<TableRow key={i} className="group hover:bg-muted/30">
								<TableCell className="px-6 py-4 text-[10px] font-mono text-muted-foreground whitespace-nowrap">
									{new Date(e.lastSeen).toLocaleString()}
								</TableCell>
								<TableCell>
									<span className="text-[11px] font-bold bg-muted px-1.5 py-0.5 rounded text-muted-foreground border border-border/50">
										{e.namespace}
									</span>
								</TableCell>
								<TableCell>
									<span
										className={`px-2 py-0.5 rounded-full text-[9px] uppercase font-black tracking-tighter ring-1 ring-inset ${
											e.type === "Normal"
												? "bg-green-100 text-green-700 ring-green-600/20"
												: "bg-amber-100 text-amber-700 ring-amber-600/20"
										}`}
									>
										{e.type}
									</span>
								</TableCell>
								<TableCell className="font-bold text-[11px] text-foreground/70 lowercase italic tracking-tight">
									{e.reason}
								</TableCell>
								<TableCell
									className="text-[11px] font-mono text-primary/80 truncate max-w-[200px] font-semibold"
									title={e.object}
								>
									{e.object}
								</TableCell>
								<TableCell className="px-6 py-4 text-xs text-muted-foreground max-w-md truncate group-hover:whitespace-normal transition-all cursor-help leading-relaxed">
									{e.message}
								</TableCell>
							</TableRow>
						))
					)}
				</TableBody>
			</Table>
		</ResourcePageLayout>
	);
}
