import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import { useState } from "react";

export const Route = createFileRoute("/_protected/dashboard/cluster/$id/events/")({
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
			<div className="p-6 flex items-center justify-center">
				<div className="text-sm text-muted-foreground animate-pulse">
					Loading cluster events...
				</div>
			</div>
		)

	if (error)
		return (
			<div className="p-6 flex items-center justify-center">
				<div className="text-sm text-destructive font-semibold">
					Error: {(error as Error).message}
				</div>
			</div>
		)

	const filteredEvents = (events || []).filter((e: any) => {
		const searchLower = searchQuery.toLowerCase();
		return (
			e.message.toLowerCase().includes(searchLower) ||
			e.reason.toLowerCase().includes(searchLower) ||
			e.object.toLowerCase().includes(searchLower) ||
			e.namespace.toLowerCase().includes(searchLower)
		)
	});

	return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
				<div className="flex items-center gap-4">
					<Link to={`/dashboard/cluster/$id`} params={{ id: clusterId }}>
						<Button variant="ghost" size="icon">
							<ArrowLeft className="h-4 w-4" />
						</Button>
					</Link>
					<div>
						<h2 className="text-3xl font-bold tracking-tight">
							Cluster Events
						</h2>
						<p className="text-muted-foreground">
							Real-time audit of activities across all namespaces
						</p>
					</div>
				</div>
			</div>
            <div className="flex items-center gap-4">
				<div className="relative flex-1 max-w-sm">
					<Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
					<Input
						placeholder="Search events (object, message, namespace...)"
						className="pl-8"
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
					/>
				</div>
			</div>
            <Card>
				<CardContent className="p-0">
					<div className="rounded-md border">
						<Table>
							<TableHeader className="bg-muted/50">
								<TableRow>
									<TableHead className="w-[180px]">Last Seen</TableHead>
									<TableHead className="w-[120px]">Namespace</TableHead>
									<TableHead className="w-[100px]">Type</TableHead>
									<TableHead className="w-[150px]">Reason</TableHead>
									<TableHead className="w-[200px]">Involved Object</TableHead>
									<TableHead>Message</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{filteredEvents.length === 0 ? (
									<TableRow>
										<TableCell
											colSpan={6}
											className="text-center h-24 text-muted-foreground italic"
										>
											{searchQuery
												? "No events match your search"
												: "No recent events found"}
										</TableCell>
									</TableRow>
								) : (
									filteredEvents.map((e: any, i: number) => (
										// biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
										(<TableRow
											// biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
											key={i}
											className="hover:bg-muted/30 transition-colors"
										>
                                            <TableCell className="text-[10px] font-mono whitespace-nowrap">
												{new Date(e.lastSeen).toLocaleString()}
											</TableCell>
                                            <TableCell>
												<span className="text-[11px] font-medium bg-secondary/50 px-1.5 py-0.5 rounded">
													{e.namespace}
												</span>
											</TableCell>
                                            <TableCell>
												<span
													className={`px-2 py-0.5 rounded-full text-[9px] uppercase font-bold tracking-tight ${
														e.type === "Normal"
															? "bg-emerald-100/80 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
															: "bg-amber-100/80 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
													}`}
												>
													{e.type}
												</span>
											</TableCell>
                                            <TableCell className="font-medium text-xs text-foreground/80 lowercase italic">
												{e.reason}
											</TableCell>
                                            <TableCell
												className="text-xs font-mono text-blue-500/80 truncate max-w-[200px]"
												title={e.object}
											>
												{e.object}
											</TableCell>
                                            <TableCell className="text-xs text-muted-foreground max-w-md truncate hover:whitespace-normal cursor-help">
												{e.message}
											</TableCell>
                                        </TableRow>)
									))
								)}
							</TableBody>
						</Table>
					</div>
				</CardContent>
			</Card>
        </div>
    )
}
