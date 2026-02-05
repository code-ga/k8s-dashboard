import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type databaseTypes, type SchemaStatic, api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EnvEditor, type EnvVar } from "@/components/shared/env-editor";
import { ExposeDialog } from "@/components/service/expose-dialog";
import { PodLogs, PodTerminal } from "@/components/pod/manage-pod-dialog";
import {
	createFileRoute,
	Link,
	useNavigate,
	useParams,
} from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/cluster/$id/pods/$podId")({
	component: ManagePodPage,
});

function ManagePodPage() {
	const { id: clusterId, podId } = useParams({
		from: "/dashboard/cluster/$id/pods/$podId",
	});
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [activeTab, setActiveTab] = useState("overview");

	const { data: pod, isLoading } = useQuery({
		queryKey: ["pod", clusterId, podId],
		queryFn: async () => {
			const res = await api.api.pods({ clusterId })({ id: podId }).get();
			if (res.error) throw res.error;
			if (!res.data.data)
				throw new Error(res.data.message || "Failed to fetch pod");
			return res.data.data;
		},
	});

	const [envVars, setEnvVars] = useState<EnvVar[]>([]);

	useEffect(() => {
		if (pod?.envVariables) {
			try {
				setEnvVars(JSON.parse(pod.envVariables));
			} catch (e) {
				console.error("Failed to parse env variables", e);
			}
		}
	}, [pod]);

	const deleteMutation = useMutation({
		mutationFn: async () => {
			const res = await api.api
				.pods({ clusterId })({ id: podId.toString() })
				.delete();
			if (res.error) {
				throw new Error(res.error.value?.message || "Failed to delete pod");
			}
			return res.data;
		},
		onSuccess: () => {
			toast.success("Pod deleted successfully");
			queryClient.invalidateQueries({ queryKey: ["pods", clusterId] });
			navigate({
				to: `/dashboard/cluster/$id/pods`,
				params: { id: clusterId },
			});
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});

	const saveEnvMutation = useMutation({
		mutationFn: async (variables: EnvVar[]) => {
			const envMap: Record<string, string> = {};
			for (const v of variables) {
				if (v.name) envMap[v.name] = v.value;
			}
			const res = await api.api
				.pods({ clusterId })({ id: podId.toString() })
				.patch({ env: envMap });
			if (res.error) {
				throw new Error(
					res.error.value?.message || "Failed to update env vars",
				);
			}
			return res.data;
		},
		onSuccess: () => {
			toast.success("Environment variables updated");
			queryClient.invalidateQueries({ queryKey: ["pods", clusterId] });
		},
		onError: (error: Error) => {
			toast.error(error.message);
		},
	});

	if (isLoading) return <div>Loading pod details...</div>;
	if (!pod) return <div>Pod not found</div>;

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-4">
					<Link to={`/dashboard/cluster/$id/pods`} params={{ id: clusterId }}>
						<Button variant="ghost" size="icon">
							<ArrowLeft className="h-4 w-4" />
						</Button>
					</Link>
					<div>
						<h2 className="text-3xl font-bold tracking-tight">
							Manage Pod: {pod.name}
						</h2>
						<p className="text-muted-foreground">
							View details, stream logs, or access the terminal for this pod.
						</p>
					</div>
				</div>
			</div>

			<Tabs
				value={activeTab}
				onValueChange={setActiveTab}
				className="flex-1 flex flex-col h-[calc(100vh-250px)]"
			>
				<TabsList className="grid w-full grid-cols-4 max-w-2xl">
					<TabsTrigger value="overview">Overview</TabsTrigger>
					<TabsTrigger value="env">Environment</TabsTrigger>
					<TabsTrigger value="logs">Logs</TabsTrigger>
					<TabsTrigger value="terminal">Terminal</TabsTrigger>
				</TabsList>

				<TabsContent
					value="overview"
					className="flex-1 overflow-auto space-y-4 pt-4"
				>
					<div className="grid grid-cols-2 gap-4 p-6 bg-muted rounded-lg border">
						<div>
							<div className="text-sm font-medium text-muted-foreground">
								Name
							</div>
							<p className="font-mono text-lg">{pod.name}</p>
						</div>
						<div>
							<div className="text-sm font-medium text-muted-foreground">
								Namespace
							</div>
							<p className="font-mono text-lg">{pod.namespace}</p>
						</div>
						<div>
							<div className="text-sm font-medium text-muted-foreground">
								Status
							</div>
							<p className="font-mono text-lg">{pod.status}</p>
						</div>
						<div>
							<div className="text-sm font-medium text-muted-foreground">
								Node
							</div>
							<p className="font-mono text-lg">{pod.nodeId}</p>
						</div>
						<div className="col-span-2">
							<div className="text-sm font-medium text-muted-foreground">
								Image
							</div>
							<p className="font-mono text-lg">{pod.dockerImage}</p>
						</div>
						<div>
							<div className="text-sm font-medium text-muted-foreground">
								CPU Request/Limit
							</div>
							<p className="font-mono text-lg">
								{pod.cpuRequest}m / {pod.cpuLimit}m
							</p>
						</div>
						<div>
							<div className="text-sm font-medium text-muted-foreground">
								Memory Request/Limit
							</div>
							<p className="font-mono text-lg">
								{pod.memoryRequest}Mi / {pod.memoryLimit}Mi
							</p>
						</div>
					</div>

					<div className="flex gap-4">
						<ExposeDialog
							clusterId={clusterId}
							defaultName={pod.name}
							defaultNamespace={pod.namespace}
							defaultInternalPort={pod.internalPort}
							selector={{ app: pod.name }}
						/>
						<Button
							variant="destructive"
							onClick={() => deleteMutation.mutate()}
							disabled={deleteMutation.isPending}
						>
							<Trash2 className="h-4 w-4 mr-2" />
							{deleteMutation.isPending ? "Deleting..." : "Delete Pod"}
						</Button>
					</div>
				</TabsContent>

				<TabsContent
					value="env"
					className="flex-1 overflow-auto pt-4 space-y-4"
				>
					<EnvEditor variables={envVars} onChange={setEnvVars} />
					<div className="flex justify-end">
						<Button
							onClick={() => saveEnvMutation.mutate(envVars)}
							disabled={saveEnvMutation.isPending}
						>
							{saveEnvMutation.isPending ? "Saving..." : "Save Environment"}
						</Button>
					</div>
				</TabsContent>

				<TabsContent
					value="logs"
					className="flex-1 overflow-hidden pt-4 border rounded-lg bg-black/5 p-4"
				>
					<PodLogs
						pod={pod as SchemaStatic<databaseTypes.databaseTypes["k8sPods"]>}
						clusterId={clusterId}
						isActive={activeTab === "logs"}
					/>
				</TabsContent>

				<TabsContent
					value="terminal"
					className="flex-1 overflow-hidden pt-4 border rounded-lg bg-black/5 p-4"
				>
					<PodTerminal
						pod={pod as SchemaStatic<databaseTypes.databaseTypes["k8sPods"]>}
						clusterId={clusterId}
						isActive={activeTab === "terminal"}
					/>
				</TabsContent>
			</Tabs>
		</div>
	);
}
