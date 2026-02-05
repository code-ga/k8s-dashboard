import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, type databaseTypes, type SchemaStatic } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Settings, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { EnvEditor, type EnvVar } from "../shared/env-editor";
import { ExposeDialog } from "../service/expose-dialog";

// interface Deployment {
// 	id: number;
// 	name: string;
// 	namespace: string;
// 	replicas: number;
// 	availableReplicas: number;
// 	unavailableReplicas: number;
// 	dockerImage: string;
// 	selector?: string;
// 	labels?: string;
// 	internalPort?: number;
// }

interface ManageDeploymentDialogProps {
	deployment: SchemaStatic<databaseTypes.databaseTypes["k8sDeployments"]>;
	clusterId: string;
}

export function ManageDeploymentDialog({
	deployment,
	clusterId,
}: ManageDeploymentDialogProps) {
	const [open, setOpen] = useState(false);
	const [activeTab, setActiveTab] = useState("overview");
	const [envVars, setEnvVars] = useState<EnvVar[]>(() => {
		try {
			return deployment.envVariables ? JSON.parse(deployment.envVariables) : [];
		} catch (e) {
			console.error("Failed to parse env variables", e);
			return [];
		}
	});
	const queryClient = useQueryClient();

	const deleteMutation = useMutation({
		mutationFn: async () => {
			const res = await api.api
				.deployments({ clusterId })({ id: deployment.id.toString() })
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
			setOpen(false);
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
				.deployments({ clusterId })({ id: deployment.id.toString() })
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
		onError: (error: any) => {
			toast.error(error.message);
		},
	});

	const selector = deployment.selector
		? JSON.parse(deployment.selector)
		: { app: deployment.name };

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="ghost" size="sm">
					<Settings className="h-4 w-4" />
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[800px] h-[600px] flex flex-col">
				<DialogHeader>
					<DialogTitle>Manage Deployment: {deployment.name}</DialogTitle>
					<DialogDescription>
						View details and stream logs for this deployment.
					</DialogDescription>
				</DialogHeader>

				<Tabs
					value={activeTab}
					onValueChange={setActiveTab}
					className="flex-1 flex flex-col"
				>
					<TabsList className="grid w-full grid-cols-3">
						<TabsTrigger value="overview">Overview</TabsTrigger>
						<TabsTrigger value="env">Environment</TabsTrigger>
						<TabsTrigger value="logs">Logs</TabsTrigger>
					</TabsList>

					<TabsContent
						value="overview"
						className="flex-1 overflow-auto space-y-4"
					>
						<div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
							<div>
								<div className="text-sm font-medium text-muted-foreground">
									Name
								</div>
								<p className="font-mono">{deployment.name}</p>
							</div>
							<div>
								<div className="text-sm font-medium text-muted-foreground">
									Namespace
								</div>
								<p className="font-mono">{deployment.namespace}</p>
							</div>
							<div>
								<div className="text-sm font-medium text-muted-foreground">
									Replicas
								</div>
								<p className="font-mono">
									{deployment.availableReplicas} / {deployment.replicas}
									{deployment.unavailableReplicas > 0 && (
										<span className="text-yellow-500 ml-2">
											({deployment.unavailableReplicas} unavailable)
										</span>
									)}
								</p>
							</div>
							<div>
								<div className="text-sm font-medium text-muted-foreground">
									Image
								</div>
								<p className="font-mono text-sm break-all">
									{deployment.dockerImage}
								</p>
							</div>
						</div>

						<div className="flex gap-2">
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
						className="flex-1 overflow-auto p-4 space-y-4"
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

					<TabsContent value="logs" className="flex-1 overflow-hidden">
						<DeploymentLogs
							deployment={deployment}
							clusterId={clusterId}
							isActive={activeTab === "logs"}
						/>
					</TabsContent>
				</Tabs>
			</DialogContent>
		</Dialog>
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

	// biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
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
