import { ExposeDialog } from "@/components/service/expose-dialog";
import { EnvEditor, type EnvVar } from "@/components/shared/env-editor";
import RefsEditor, {
	type IConfigMapEnvFromRef,
	type IConfigMapEnvRef,
	type ISecretEnvFromRef,
	type ISecretEnvRef,
} from "@/components/shared/refs-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, type databaseTypes, type SchemaStatic } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, Plus, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

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

	const [image, setImage] = useState("");
	const [command, setCommand] = useState<string[]>([]);
	const [args, setArgs] = useState<string[]>([]);
	const [envVars, setEnvVars] = useState<EnvVar[]>([]);
	const [configMapEnvRefs, setConfigMapEnvRefs] = useState<IConfigMapEnvRef[]>(
		[],
	);
	const [configMapEnvFromRefs, setConfigMapEnvFromRefs] = useState<
		IConfigMapEnvFromRef[]
	>([]);
	const [secretEnvRefs, setSecretEnvRefs] = useState<ISecretEnvRef[]>([]);
	const [secretEnvFromRefs, setSecretEnvFromRefs] = useState<
		ISecretEnvFromRef[]
	>([]);
	const [ports, setPorts] = useState<
		{ containerPort: number; name?: string }[]
	>([]);
	const [cpuRequest, setCpuRequest] = useState("");
	const [cpuLimit, setCpuLimit] = useState("");
	const [memoryRequest, setMemoryRequest] = useState("");
	const [memoryLimit, setMemoryLimit] = useState("");
	const [labels, setLabels] = useState<EnvVar[]>([]);
	const [replicas, setReplicas] = useState(1);

	useEffect(() => {
		if (deployment) {
			setImage(deployment.dockerImage);
			setReplicas(deployment.replicas);
			setCommand(deployment.command ? deployment.command.split(" ") : []);
			setArgs(deployment.args ? deployment.args.split(" ") : []);
			try {
				if (deployment.envVariables) {
					const parsed = (JSON.parse(deployment.envVariables) || {}) as Record<
						string,
						string
					>;
					setEnvVars(
						Object.entries(parsed).map(([name, value]) => ({ name, value })),
					);
				} else {
					setEnvVars([]);
				}
			} catch (_e) {
				console.error("Failed to parse env variables", _e);
				setEnvVars([]);
			}
			setPorts(deployment.ports || []);
			setCpuRequest(`${deployment.cpuRequest}m`);
			setCpuLimit(`${deployment.cpuLimit}m`);
			setMemoryRequest(`${deployment.memoryRequest}Mi`);
			setMemoryLimit(`${deployment.memoryLimit}Mi`);
			try {
				if (deployment.labels) {
					const parsed = JSON.parse(deployment.labels);
					setLabels(
						Object.entries(parsed).map(([name, value]) => ({
							name,
							value: String(value),
						})),
					);
				} else {
					setLabels([]);
				}
			} catch (_e) {
				setLabels([]);
			}

			// load refs
			try {
				if (deployment.configMapRefs) {
					setConfigMapEnvRefs(deployment.configMapRefs.env || []);
					setConfigMapEnvFromRefs(deployment.configMapRefs.envFrom || []);
				}
			} catch {
				setConfigMapEnvRefs([]);
				setConfigMapEnvFromRefs([]);
			}

			try {
				if (deployment.secretRefs) {
					setSecretEnvRefs(deployment.secretRefs.env || []);
					setSecretEnvFromRefs(deployment.secretRefs.envFrom || []);
				}
			} catch {
				setSecretEnvRefs([]);
				setSecretEnvFromRefs([]);
			}
		}
	}, [deployment]);

	const saveDeploymentMutation = useMutation({
		mutationFn: async () => {
			const envMap: Record<string, string> = {};
			for (const v of envVars) {
				if (v.name) envMap[v.name] = v.value;
			}

			const labelsMap: Record<string, string> = {};
			for (const l of labels) {
				if (l.name) labelsMap[l.name] = l.value;
			}

			const res = await api.api
				.deployments({ clusterId })({ id: deploymentId.toString() })
				.patch({
					image,
					replicas,
					command: command.length > 0 ? command : undefined,
					args: args.length > 0 ? args : undefined,
					env: envMap,
					configMapRefs:
						configMapEnvRefs.length > 0 || configMapEnvFromRefs.length > 0
							? {
									env:
										configMapEnvRefs.length > 0 ? configMapEnvRefs : undefined,
									envFrom:
										configMapEnvFromRefs.length > 0
											? configMapEnvFromRefs
											: undefined,
								}
							: undefined,
					secretRefs:
						secretEnvRefs.length > 0 || secretEnvFromRefs.length > 0
							? {
									env: secretEnvRefs.length > 0 ? secretEnvRefs : undefined,
									envFrom:
										secretEnvFromRefs.length > 0
											? secretEnvFromRefs
											: undefined,
								}
							: undefined,
					labels: labelsMap,
					resources: {
						requests: { cpu: cpuRequest, memory: memoryRequest },
						limits: { cpu: cpuLimit, memory: memoryLimit },
					},
					ports: ports.length > 0 ? ports : undefined,
				});
			if (res.error) {
				throw new Error(
					res.error.value?.message || "Failed to update deployment",
				);
			}
			return res.data;
		},
		onSuccess: () => {
			toast.success("Deployment update initiated");
			queryClient.invalidateQueries({ queryKey: ["deployments", clusterId] });
			queryClient.invalidateQueries({
				queryKey: ["deployment", clusterId, deploymentId],
			});
		},
		onError: (error: Error) => {
			toast.error(error.message);
		},
	});

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

	const RecreationWarning = () => (
		<div className="bg-yellow-500/10 border border-yellow-500/50 rounded-lg p-3 flex gap-3 items-start">
			<AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
			<div className="text-sm text-yellow-200">
				<span className="font-bold text-yellow-500">Warning:</span> Saving
				certain changes (image, env, resources) will cause the deployment pods
				to be restarted.
			</div>
		</div>
	);

	if (isLoading)
		return <div className="p-6">Loading deployment details...</div>;
	if (!deployment) return <div className="p-6">Deployment not found</div>;

	const selector = deployment.selector
		? JSON.parse(deployment.selector)
		: { app: deployment.name };

	return (
		<div className="flex flex-col h-screen bg-background">
			{/* Header Section */}
			<div className="border-b border-border bg-card">
				<div className="px-6 py-6 flex items-center justify-between">
					<div className="flex items-center gap-4 flex-1">
						<Link
							to={`/dashboard/cluster/$id/deployments`}
							params={{ id: clusterId }}
						>
							<Button variant="ghost" size="icon" className="h-9 w-9">
								<ArrowLeft className="h-4 w-4" />
							</Button>
						</Link>
						<div className="flex-1 min-w-0">
							<h1 className="text-2xl font-bold tracking-tight truncate">
								{deployment.name}
							</h1>
							<p className="text-sm text-muted-foreground">
								View and manage deployment configuration and replicas.
							</p>
						</div>
					</div>
					<div className="flex gap-2 ml-4 flex-shrink-0">
						<ExposeDialog
							clusterId={clusterId}
							defaultName={deployment.name}
							defaultNamespace={deployment.namespace}
							defaultInternalPort={deployment.ports?.[0]?.containerPort || 80}
							selector={selector}
						/>
						<Button
							variant="destructive"
							onClick={() => deleteMutation.mutate()}
							disabled={deleteMutation.isPending}
							size="sm"
						>
							<Trash2 className="h-4 w-4 mr-2" />
							{deleteMutation.isPending ? "Deleting..." : "Delete"}
						</Button>
					</div>
				</div>
			</div>

			{/* Tabs Section */}
			<Tabs
				value={activeTab}
				onValueChange={setActiveTab}
				className="flex-1 flex flex-col overflow-hidden"
			>
				<div className="border-b border-border bg-card px-6">
					<TabsList className="grid w-full grid-cols-6 max-w-3xl h-auto bg-transparent p-0 gap-0">
						<TabsTrigger
							value="overview"
							className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
						>
							Overview
						</TabsTrigger>
						<TabsTrigger
							value="config"
							className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
						>
							Config
						</TabsTrigger>
						<TabsTrigger
							value="env"
							className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
						>
							Environment
						</TabsTrigger>
						<TabsTrigger
							value="resources"
							className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
						>
							Resources
						</TabsTrigger>
						<TabsTrigger
							value="labels"
							className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
						>
							Labels
						</TabsTrigger>
						<TabsTrigger
							value="pods"
							className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
						>
							Pods
						</TabsTrigger>
					</TabsList>
				</div>

				{/* Overview Tab */}
				<TabsContent
					value="overview"
					className="flex-1 overflow-auto p-6 space-y-6"
				>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
						<div className="space-y-2">
							<span className="text-xs font-semibold text-muted-foreground uppercase">
								Name
							</span>
							<p className="font-mono text-sm">{deployment.name}</p>
						</div>
						<div className="space-y-2">
							<span className="text-xs font-semibold text-muted-foreground uppercase">
								Namespace
							</span>
							<p className="font-mono text-sm">{deployment.namespace}</p>
						</div>
						<div className="space-y-2">
							<span className="text-xs font-semibold text-muted-foreground uppercase">
								Replicas
							</span>
							<p className="font-mono text-sm">
								{deployment.availableReplicas} / {deployment.replicas}
								{deployment.unavailableReplicas > 0 && (
									<span className="text-yellow-500 ml-2">
										({deployment.unavailableReplicas} unavailable)
									</span>
								)}
							</p>
						</div>
						<div className="md:col-span-2 space-y-2">
							<span className="text-xs font-semibold text-muted-foreground uppercase">
								Image
							</span>
							<p className="font-mono text-sm break-all">
								{deployment.dockerImage}
							</p>
						</div>
						<div className="md:col-span-2 space-y-2">
							<span className="text-xs font-semibold text-muted-foreground uppercase">
								Command / Args
							</span>
							<p className="font-mono text-sm break-all">
								{deployment.command || "(default)"} {deployment.args}
							</p>
						</div>
					</div>
				</TabsContent>

				{/* Config Tab */}
				<TabsContent
					value="config"
					className="flex-1 overflow-auto p-6 space-y-6"
				>
					<RecreationWarning />
					<div className="max-w-2xl space-y-6">
						<div className="space-y-2">
							<Label htmlFor="deployment-image">Container Image</Label>
							<Input
								id="deployment-image"
								value={image}
								onChange={(e) => setImage(e.target.value)}
								placeholder="e.g., nginx:latest"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="dep-replicas">Replicas</Label>
							<Input
								id="dep-replicas"
								type="number"
								value={replicas}
								onChange={(e) => setReplicas(Number(e.target.value))}
								placeholder="3"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="deployment-command">
								Command (space-separated)
							</Label>
							<Input
								id="deployment-command"
								value={command.join(" ")}
								onChange={(e) => setCommand(e.target.value.split(" "))}
								placeholder="e.g., /bin/sh"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="deployment-args">
								Arguments (space-separated)
							</Label>
							<Input
								id="deployment-args"
								value={args.join(" ")}
								onChange={(e) => setArgs(e.target.value.split(" "))}
								placeholder="e.g., -c 'echo hello'"
							/>
						</div>
						<div className="space-y-4">
							<div className="flex items-center justify-between">
								<Label>Container Ports</Label>
								<Button
									variant="outline"
									size="sm"
									onClick={() =>
										setPorts([...ports, { containerPort: 80, name: "" }])
									}
								>
									<Plus className="h-4 w-4 mr-1" /> Add Port
								</Button>
							</div>
							<div className="space-y-3">
								{ports.map((p, i) => (
									<div
										key={`${p.containerPort}-${i}`}
										className="flex gap-2 items-end"
									>
										<div className="flex-1">
											<Label className="text-[10px] text-muted-foreground uppercase">
												Port
											</Label>
											<Input
												type="number"
												value={p.containerPort}
												onChange={(e) => {
													const newPorts = [...ports];
													newPorts[i].containerPort = Number(e.target.value);
													setPorts(newPorts);
												}}
											/>
										</div>
										<div className="flex-1">
											<Label className="text-[10px] text-muted-foreground uppercase">
												Name
											</Label>
											<Input
												value={p.name}
												onChange={(e) => {
													const newPorts = [...ports];
													newPorts[i].name = e.target.value;
													setPorts(newPorts);
												}}
											/>
										</div>
										<Button
											variant="ghost"
											size="icon"
											onClick={() =>
												setPorts(ports.filter((_, idx) => idx !== i))
											}
										>
											<X className="h-4 w-4" />
										</Button>
									</div>
								))}
							</div>
						</div>
					</div>
					<div className="flex justify-end gap-2 pt-4">
						<Button
							onClick={() => saveDeploymentMutation.mutate()}
							disabled={saveDeploymentMutation.isPending}
						>
							{saveDeploymentMutation.isPending
								? "Updating..."
								: "Update Deployment"}
						</Button>
					</div>
				</TabsContent>

				{/* Environment Tab */}
				<TabsContent value="env" className="flex-1 overflow-auto p-6 space-y-6">
					<RecreationWarning />
					<div className="space-y-6">
						<div>
							<h3 className="text-sm font-semibold mb-4">
								Environment Variables
							</h3>
							<EnvEditor variables={envVars} onChange={setEnvVars} />
						</div>
						<div>
							<h3 className="text-sm font-semibold mb-4">References</h3>
							<RefsEditor
								clusterId={clusterId}
								configMapRefs={{
									env: configMapEnvRefs,
									envFrom: configMapEnvFromRefs,
								}}
								secretRefs={{ env: secretEnvRefs, envFrom: secretEnvFromRefs }}
								onChange={(r) => {
									setConfigMapEnvRefs(r.configMapRefs?.env || []);
									setConfigMapEnvFromRefs(r.configMapRefs?.envFrom || []);
									setSecretEnvRefs(r.secretRefs?.env || []);
									setSecretEnvFromRefs(r.secretRefs?.envFrom || []);
								}}
							/>
						</div>
					</div>
					<div className="flex justify-end gap-2 pt-4">
						<Button
							onClick={() => saveDeploymentMutation.mutate()}
							disabled={saveDeploymentMutation.isPending}
						>
							{saveDeploymentMutation.isPending
								? "Updating..."
								: "Update Deployment"}
						</Button>
					</div>
				</TabsContent>

				{/* Resources Tab */}
				<TabsContent
					value="resources"
					className="flex-1 overflow-auto p-6 space-y-6"
				>
					<RecreationWarning />
					<div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-2xl">
						<div className="space-y-4">
							<h3 className="text-sm font-semibold border-b pb-2">Requests</h3>
							<div className="space-y-2">
								<Label htmlFor="dep-cpu-request">CPU (millicores)</Label>
								<Input
									id="dep-cpu-request"
									value={cpuRequest}
									onChange={(e) => setCpuRequest(e.target.value)}
									placeholder="500m"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="dep-memory-request">Memory (MiB)</Label>
								<Input
									id="dep-memory-request"
									value={memoryRequest}
									onChange={(e) => setMemoryRequest(e.target.value)}
									placeholder="256Mi"
								/>
							</div>
						</div>
						<div className="space-y-4">
							<h3 className="text-sm font-semibold border-b pb-2">Limits</h3>
							<div className="space-y-2">
								<Label htmlFor="dep-cpu-limit">CPU (millicores)</Label>
								<Input
									id="dep-cpu-limit"
									value={cpuLimit}
									onChange={(e) => setCpuLimit(e.target.value)}
									placeholder="1000m"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="dep-memory-limit">Memory (MiB)</Label>
								<Input
									id="dep-memory-limit"
									value={memoryLimit}
									onChange={(e) => setMemoryLimit(e.target.value)}
									placeholder="512Mi"
								/>
							</div>
						</div>
					</div>
					<div className="flex justify-end gap-2 pt-4">
						<Button
							onClick={() => saveDeploymentMutation.mutate()}
							disabled={saveDeploymentMutation.isPending}
						>
							{saveDeploymentMutation.isPending
								? "Updating..."
								: "Update Deployment"}
						</Button>
					</div>
				</TabsContent>

				{/* Labels Tab */}
				<TabsContent
					value="labels"
					className="flex-1 overflow-auto p-6 space-y-6"
				>
					<RecreationWarning />
					<EnvEditor variables={labels} onChange={setLabels} />
					<div className="flex justify-end gap-2 pt-4">
						<Button
							onClick={() => saveDeploymentMutation.mutate()}
							disabled={saveDeploymentMutation.isPending}
						>
							{saveDeploymentMutation.isPending
								? "Updating..."
								: "Update Deployment"}
						</Button>
					</div>
				</TabsContent>

				{/* Logs Tab */}
				<TabsContent
					value="logs"
					className="flex-1 overflow-hidden p-6 flex flex-col"
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
		<div className="h-full flex flex-col gap-3">
			<div className="flex items-center justify-between">
				<p className="text-sm font-medium">Live Deployment Logs</p>
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
