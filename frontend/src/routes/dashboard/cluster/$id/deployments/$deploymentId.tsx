import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, type databaseTypes, type SchemaStatic } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Trash2 } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import { EnvEditor, type EnvVar } from "@/components/shared/env-editor";
import { ExposeDialog } from "@/components/service/expose-dialog";
import {
	createFileRoute,
	Link,
	useNavigate,
	useParams,
} from "@tanstack/react-router";

export const Route = createFileRoute(
	"/dashboard/cluster/$id/deployments/$deploymentId",
)({
	component: ManageDeploymentPage,
});

function ManageDeploymentPage() {
	const { id: clusterId, deploymentId } = useParams({
		from: "/dashboard/cluster/$id/deployments/$deploymentId",
	});
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [activeTab, setActiveTab] = useState("overview");

	const { data: deployment, isLoading } = useQuery({
		queryKey: ["deployment", clusterId, deploymentId],
		queryFn: async () => {
			const res = await api.api
				.deployments({ clusterId })({ id: deploymentId })
				.get();
			if (res.error) throw res.error;
			if (!res.data.data)
				throw new Error(res.data.message || "Failed to fetch deployment");
			return res.data.data;
		},
	});

	const [envVars, setEnvVars] = useState<EnvVar[]>([]);

	useEffect(() => {
		if (deployment?.envVariables) {
			try {
				setEnvVars(JSON.parse(deployment.envVariables));
			} catch (_e) {
				console.error("Failed to parse env variables", _e);
			}
		}
	}, [deployment]);

	const deleteMutation = useMutation({
		mutationFn: async () => {
			const res = await api.api
				.deployments({ clusterId })({ id: deploymentId.toString() })
				.delete();
			if (res.error) {
				throw new Error(
					res.error.value?.message || "Failed to delete deployment",
				);
			}
			return res.data;
		},
		onSuccess: () => {
			toast.success("Deployment deleted successfully");
			queryClient.invalidateQueries({ queryKey: ["deployments", clusterId] });
			navigate({
				to: `/dashboard/cluster/$id/deployments`,
				params: { id: clusterId },
			});
		},
		onError: (error: Error) => {
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
				.deployments({ clusterId })({ id: deploymentId.toString() })
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
			queryClient.invalidateQueries({ queryKey: ["deployments", clusterId] });
		},
		onError: (error: Error) => {
			toast.error(error.message);
		},
	});

	if (isLoading) return <div>Loading deployment details...</div>;
	if (!deployment) return <div>Deployment not found</div>;

	const selector = deployment.selector
		? JSON.parse(deployment.selector)
		: { app: deployment.name };

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-4">
					<Link
						to={`/dashboard/cluster/$id/deployments`}
						params={{ id: clusterId }}
					>
						<Button variant="ghost" size="icon">
							<ArrowLeft className="h-4 w-4" />
						</Button>
					</Link>
					<div>
						<h2 className="text-3xl font-bold tracking-tight">
							Manage Deployment: {deployment.name}
						</h2>
						<p className="text-muted-foreground">
							View details and stream logs for this deployment.
						</p>
					</div>
				</div>
			</div>

			<Tabs
				value={activeTab}
				onValueChange={setActiveTab}
				className="flex-1 flex flex-col h-[calc(100vh-250px)]"
			>
				<TabsList className="grid w-full grid-cols-3 max-w-xl">
					<TabsTrigger value="overview">Overview</TabsTrigger>
					<TabsTrigger value="env">Environment</TabsTrigger>
					<TabsTrigger value="logs">Logs</TabsTrigger>
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
							<p className="font-mono text-lg">{deployment.name}</p>
						</div>
						<div>
							<div className="text-sm font-medium text-muted-foreground">
								Namespace
							</div>
							<p className="font-mono text-lg">{deployment.namespace}</p>
						</div>
						<div>
							<div className="text-sm font-medium text-muted-foreground">
								Replicas
							</div>
							<p className="font-mono text-lg">
								{deployment.availableReplicas} / {deployment.replicas}
								{deployment.unavailableReplicas > 0 && (
									<span className="text-yellow-500 ml-2">
										({deployment.unavailableReplicas} unavailable)
									</span>
								)}
							</p>
						</div>
						<div className="col-span-2 text-wrap">
							<div className="text-sm font-medium text-muted-foreground">
								Image
							</div>
							<p className="font-mono text-lg break-all">
								{deployment.dockerImage}
							</p>
						</div>
					</div>

					<div className="flex gap-4">
						<ExposeDialog
							clusterId={clusterId}
							defaultName={deployment.name}
							defaultNamespace={deployment.namespace}
							defaultInternalPort={deployment.internalPort}
							selector={selector}
						/>
						<Button
							variant="destructive"
							onClick={() => deleteMutation.mutate()}
							disabled={deleteMutation.isPending}
						>
							<Trash2 className="h-4 w-4 mr-2" />
							{deleteMutation.isPending ? "Deleting..." : "Delete Deployment"}
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
					<DeploymentLogs
						deployment={
							deployment as SchemaStatic<
								databaseTypes.databaseTypes["k8sDeployments"]
							>
						}
						clusterId={clusterId}
						isActive={activeTab === "logs"}
					/>
				</TabsContent>
			</Tabs>
		</div>
	);
}

interface DeploymentLogsProps {
	deployment: SchemaStatic<databaseTypes.databaseTypes["k8sDeployments"]>;
	clusterId: string;
	isActive: boolean;
}

export function DeploymentLogs({
	deployment,
	clusterId,
	isActive,
}: DeploymentLogsProps) {
	const [logs, setLogs] = useState<string>("");
	const [autoScroll, setAutoScroll] = useState(true);
	const logsRef = useRef<HTMLPreElement>(null);
	const wsRef = useRef<WebSocket | null>(null);

	useEffect(() => {
		if (!isActive) {
			wsRef.current?.close();
			wsRef.current = null;
			return;
		}

		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
		const ws = new WebSocket(
			`${protocol}//${window.location.host}/api/deployments/${clusterId}/logs/${deployment.id}`,
		);
		wsRef.current = ws;

		ws.onmessage = (event) => {
			if (event.data instanceof Blob) {
				event.data.text().then((text) => {
					setLogs((prev) => prev + text);
				});
			} else {
				setLogs((prev) => prev + event.data);
			}
		};

		ws.onerror = (error) => {
			console.error("WebSocket error:", error);
			toast.error("Failed to connect to log stream");
		};

		return () => {
			ws.close();
			wsRef.current = null;
		};
	}, [isActive, deployment.id, clusterId]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: reason
	useEffect(() => {
		if (autoScroll && logsRef.current) {
			logsRef.current.scrollTop = logsRef.current.scrollHeight;
		}
	}, [logs, autoScroll]);

	return (
		<div className="h-full flex flex-col">
			<div className="flex items-center justify-between mb-2">
				<p className="text-sm font-medium">
					Live Logs (from a pod in deployment)
				</p>
				<Button
					variant={autoScroll ? "default" : "outline"}
					size="sm"
					onClick={() => setAutoScroll(!autoScroll)}
				>
					{autoScroll ? "Auto-scroll ON" : "Auto-scroll OFF"}
				</Button>
			</div>
			<pre
				ref={logsRef}
				className="flex-1 bg-black text-green-400 p-4 rounded-lg overflow-auto font-mono text-xs"
			>
				{logs || "Waiting for logs..."}
			</pre>
		</div>
	);
}
