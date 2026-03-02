import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	useNavigate,
	useParams,
} from "@tanstack/react-router";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { AlertTriangle, ArrowLeft, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Terminal } from "xterm";
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
import "xterm/css/xterm.css";
import { BACKEND_URL } from "../../../../../constants";

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

	// State for all configurable fields
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

	useEffect(() => {
		if (pod) {
			setImage(pod.dockerImage);
			setCommand(pod.command ? pod.command.split(" ") : []);
			setArgs(pod.args ? pod.args.split(" ") : []);
			try {
				const parsed = (JSON.parse(pod.envVariables) || {}) as Record<
					string,
					string
				>;
				setEnvVars(
					Object.entries(parsed).map(([name, value]) => ({ name, value })),
				);
			} catch (_e) {
				console.error("Failed to parse env variables", _e);
				setEnvVars([]);
			}
			setPorts(pod.ports || []);

			setCpuRequest(`${pod.cpuRequest}m`);
			setCpuLimit(`${pod.cpuLimit}m`);
			setMemoryRequest(`${pod.memoryRequest}Mi`);
			setMemoryLimit(`${pod.memoryLimit}Mi`);
			try {
				if (pod.labels) {
					const parsed = JSON.parse(pod.labels);
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

			// load refs if present
			try {
				if (pod.configMapRefs) {
					setConfigMapEnvRefs(pod.configMapRefs.env || []);
					setConfigMapEnvFromRefs(pod.configMapRefs.envFrom || []);
				}
			} catch {
				setConfigMapEnvRefs([]);
				setConfigMapEnvFromRefs([]);
			}

			try {
				if (pod.secretRefs) {
					setSecretEnvRefs(pod.secretRefs.env || []);
					setSecretEnvFromRefs(pod.secretRefs.envFrom || []);
				}
			} catch {
				setSecretEnvRefs([]);
				setSecretEnvFromRefs([]);
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

	const savePodMutation = useMutation({
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
				.pods({ clusterId })({ id: podId.toString() })
				.patch({
					image,
					command: command.length > 0 ? command : undefined,
					args: args.length > 0 ? args : undefined,
					env: envMap,
					configMapRefs:
						(configMapEnvRefs && configMapEnvRefs?.length > 0) ||
						(configMapEnvFromRefs && configMapEnvFromRefs?.length > 0)
							? {
									env:
										configMapEnvRefs && configMapEnvRefs?.length > 0
											? configMapEnvRefs
											: undefined,
									envFrom:
										configMapEnvFromRefs && configMapEnvFromRefs?.length > 0
											? configMapEnvFromRefs
											: undefined,
								}
							: undefined,
					secretRefs:
						(secretEnvRefs && secretEnvRefs?.length > 0) ||
						(secretEnvFromRefs && secretEnvFromRefs?.length > 0)
							? {
									env:
										secretEnvRefs && secretEnvRefs?.length > 0
											? secretEnvRefs
											: undefined,
									envFrom:
										secretEnvFromRefs && secretEnvFromRefs?.length > 0
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
				throw new Error(res.error.value?.message || "Failed to update pod");
			}
			return res.data;
		},
		onSuccess: () => {
			toast.success("Pod update initiated (recreation)");
			queryClient.invalidateQueries({ queryKey: ["pods", clusterId] });
			queryClient.invalidateQueries({ queryKey: ["pod", clusterId, podId] });
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
				changes will cause the pod to be deleted and recreated. Active
				connections like logs or terminal will be interrupted.
			</div>
		</div>
	);

	if (isLoading) return <div className="p-6">Loading pod details...</div>;
	if (!pod) return <div className="p-6">Pod not found</div>;

	return (
		<div className="flex flex-col h-screen bg-background">
			{/* Header Section */}
			<div className="border-b border-border bg-card">
				<div className="px-6 py-6 flex items-center justify-between">
					<div className="flex items-center gap-4 flex-1">
						<Link to={`/dashboard/cluster/$id/pods`} params={{ id: clusterId }}>
							<Button variant="ghost" size="icon" className="h-9 w-9">
								<ArrowLeft className="h-4 w-4" />
							</Button>
						</Link>
						<div className="flex-1 min-w-0">
							<h1 className="text-2xl font-bold tracking-tight truncate">
								{pod.name}
							</h1>
							<p className="text-sm text-muted-foreground">
								View and manage pod configuration, environment, and resources.
							</p>
						</div>
					</div>
					<div className="flex gap-2 ml-4 flex-shrink-0">
						<ExposeDialog
							clusterId={clusterId}
							defaultName={pod.name}
							defaultNamespace={pod.namespace}
							defaultInternalPort={
								pod.ports && pod.ports.length > 0
									? pod.ports[0].containerPort
									: 80
							}
							selector={{ app: pod.name }}
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
					<TabsList className="grid w-full grid-cols-7 max-w-3xl h-auto bg-transparent p-0 gap-0">
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
							value="logs"
							className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
						>
							Logs
						</TabsTrigger>
						<TabsTrigger
							value="terminal"
							className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
						>
							Terminal
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
							<p className="font-mono text-sm">{pod.name}</p>
						</div>
						<div className="space-y-2">
							<span className="text-xs font-semibold text-muted-foreground uppercase">
								Namespace
							</span>
							<p className="font-mono text-sm">{pod.namespace}</p>
						</div>
						<div className="space-y-2">
							<span className="text-xs font-semibold text-muted-foreground uppercase">
								Status
							</span>
							<p className="font-mono text-sm">{pod.status}</p>
						</div>
						<div className="space-y-2">
							<span className="text-xs font-semibold text-muted-foreground uppercase">
								Node
							</span>
							<p className="font-mono text-sm">{pod.nodeId}</p>
						</div>
						<div className="md:col-span-2 space-y-2">
							<span className="text-xs font-semibold text-muted-foreground uppercase">
								Image
							</span>
							<p className="font-mono text-sm break-all">{pod.dockerImage}</p>
						</div>
						<div className="space-y-2">
							<span className="text-xs font-semibold text-muted-foreground uppercase">
								CPU Request/Limit
							</span>
							<p className="font-mono text-sm">
								{pod.cpuRequest}m / {pod.cpuLimit}m
							</p>
						</div>
						<div className="space-y-2">
							<span className="text-xs font-semibold text-muted-foreground uppercase">
								Memory Request/Limit
							</span>
							<p className="font-mono text-sm">
								{pod.memoryRequest}Mi / {pod.memoryLimit}Mi
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
							<Label htmlFor="image">Container Image</Label>
							<Input
								id="image"
								value={image}
								onChange={(e) => setImage(e.target.value)}
								placeholder="e.g., nginx:latest"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="command">Command (space-separated)</Label>
							<Input
								id="command"
								value={command.join(" ")}
								onChange={(e) => setCommand(e.target.value.split(" "))}
								placeholder="e.g., /bin/sh"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="args">Arguments (space-separated)</Label>
							<Input
								id="args"
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
							onClick={() => savePodMutation.mutate()}
							disabled={savePodMutation.isPending}
						>
							{savePodMutation.isPending ? "Updating..." : "Update Pod"}
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
							onClick={() => savePodMutation.mutate()}
							disabled={savePodMutation.isPending}
						>
							{savePodMutation.isPending ? "Updating..." : "Update Pod"}
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
								<Label htmlFor="cpu-request">CPU (millicores)</Label>
								<Input
									id="cpu-request"
									value={cpuRequest}
									onChange={(e) => setCpuRequest(e.target.value)}
									placeholder="500m"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="memory-request">Memory (MiB)</Label>
								<Input
									id="memory-request"
									value={memoryRequest}
									onChange={(e) => setMemoryRequest(e.target.value)}
									placeholder="256Mi"
								/>
							</div>
						</div>
						<div className="space-y-4">
							<h3 className="text-sm font-semibold border-b pb-2">Limits</h3>
							<div className="space-y-2">
								<Label htmlFor="cpu-limit">CPU (millicores)</Label>
								<Input
									id="cpu-limit"
									value={cpuLimit}
									onChange={(e) => setCpuLimit(e.target.value)}
									placeholder="1000m"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="memory-limit">Memory (MiB)</Label>
								<Input
									id="memory-limit"
									value={memoryLimit}
									onChange={(e) => setMemoryLimit(e.target.value)}
									placeholder="512Mi"
								/>
							</div>
						</div>
					</div>
					<div className="flex justify-end gap-2 pt-4">
						<Button
							onClick={() => savePodMutation.mutate()}
							disabled={savePodMutation.isPending}
						>
							{savePodMutation.isPending ? "Updating..." : "Update Pod"}
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
							onClick={() => savePodMutation.mutate()}
							disabled={savePodMutation.isPending}
						>
							{savePodMutation.isPending ? "Updating..." : "Update Pod"}
						</Button>
					</div>
				</TabsContent>

				{/* Logs Tab */}
				<TabsContent
					value="logs"
					className="flex-1 overflow-hidden p-6 flex flex-col"
				>
					<PodLogs
						pod={pod as SchemaStatic<databaseTypes.databaseTypes["k8sPods"]>}
						clusterId={clusterId}
						isActive={activeTab === "logs"}
					/>
				</TabsContent>

				{/* Terminal Tab */}
				<TabsContent
					value="terminal"
					className="flex-1 overflow-hidden p-6 flex flex-col"
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

interface PodLogsProps {
	pod: SchemaStatic<databaseTypes.databaseTypes["k8sPods"]>;
	clusterId: string;
	isActive: boolean;
}

export function PodLogs({ pod, clusterId, isActive }: PodLogsProps) {
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
		const backendUrl = new URL(BACKEND_URL);
		const ws = new WebSocket(
			`${protocol}//${backendUrl.host}/api/pods/${clusterId}/logs/${pod.id}`,
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
	}, [isActive, pod.id, clusterId]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: auto-scroll logic
	useEffect(() => {
		if (autoScroll && logsRef.current) {
			logsRef.current.scrollTop = logsRef.current.scrollHeight;
		}
	}, [logs, autoScroll]);

	return (
		<div className="h-full flex flex-col gap-3">
			<div className="flex items-center justify-between">
				<div className="text-sm font-medium">Live Pod Logs</div>
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

interface PodTerminalProps {
	pod: SchemaStatic<databaseTypes.databaseTypes["k8sPods"]>;
	clusterId: string;
	isActive: boolean;
}

export function PodTerminal({ pod, clusterId, isActive }: PodTerminalProps) {
	const terminalRef = useRef<HTMLDivElement>(null);
	const xtermRef = useRef<Terminal | null>(null);
	const fitAddonRef = useRef<FitAddon | null>(null);
	const wsRef = useRef<WebSocket | null>(null);

	const sendResize = useCallback((cols: number, rows: number) => {
		if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
			wsRef.current.send(JSON.stringify({ type: "resize", cols, rows }));
		}
	}, []);

	useEffect(() => {
		if (!isActive || !terminalRef.current) {
			// Cleanup
			xtermRef.current?.dispose();
			xtermRef.current = null;
			wsRef.current?.close();
			wsRef.current = null;
			return;
		}

		let isCancelled = false;
		let term: Terminal | null = null;
		let ws: WebSocket | null = null;
		let resizeObserver: ResizeObserver | null = null;

		const init = () => {
			if (isCancelled || !terminalRef.current) return;

			// Initialize xterm
			term = new Terminal({
				cursorBlink: true,
				fontSize: 14,
				fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
				theme: {
					background: "#1a1b26",
					foreground: "#a9b1d6",
					cursor: "#c0caf5",
				},
			});

			const fitAddon = new FitAddon();
			const webLinksAddon = new WebLinksAddon();

			term.loadAddon(fitAddon);
			term.loadAddon(webLinksAddon);

			term.open(terminalRef.current);

			// Only fit if dimensions are available
			if (
				terminalRef.current.clientWidth > 0 &&
				terminalRef.current.clientHeight > 0
			) {
				try {
					fitAddon.fit();
				} catch (e) {
					console.warn("Fit error:", e);
				}
			}

			xtermRef.current = term;
			fitAddonRef.current = fitAddon;

			// Connect WebSocket
			const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
			const backendUrl = new URL(
				`http${protocol.includes("https") ? "s" : ""}://${window.location.host}`,
			);
			ws = new WebSocket(
				`${protocol}//${backendUrl.host}/api/pods/${clusterId}/exec/${pod.id}`,
			);
			wsRef.current = ws;

			ws.binaryType = "arraybuffer";

			ws.onopen = () => {
				if (!term) return;
				term.write("\x1b[33mConnecting to pod terminal...\x1b[0m\r\n");
				sendResize(term.cols, term.rows);
			};

			ws.onmessage = (event) => {
				if (!term) return;
				if (event.data instanceof ArrayBuffer) {
					term.write(new Uint8Array(event.data));
				} else {
					term.write(event.data);
				}
			};

			ws.onerror = () => {
				term?.write("\x1b[31mError connecting to terminal\x1b[0m\r\n");
			};

			ws.onclose = () => {
				term?.write("\x1b[31m\r\nConnection closed\x1b[0m\r\n");
			};

			// Send user input to WebSocket
			term.onData((data) => {
				if (ws?.readyState === WebSocket.OPEN) {
					ws.send(data);
				}
			});

			// Handle resize
			resizeObserver = new ResizeObserver(() => {
				if (!fitAddon || !term) return;
				try {
					if (terminalRef.current && terminalRef.current.clientWidth > 0) {
						fitAddon.fit();
						sendResize(term.cols, term.rows);
					}
				} catch (_e) {
					// Ignore resize errors
				}
			});
			resizeObserver.observe(terminalRef.current);
		};

		// Use requestAnimationFrame to ensure the container is rendered and has size
		const rafId = requestAnimationFrame(init);

		return () => {
			isCancelled = true;
			cancelAnimationFrame(rafId);
			resizeObserver?.disconnect();
			term?.dispose();
			ws?.close();
			xtermRef.current = null;
			wsRef.current = null;
		};
	}, [isActive, pod.id, clusterId, sendResize]);

	return (
		<div
			ref={terminalRef}
			className="h-full w-full rounded-lg overflow-hidden"
			style={{ minHeight: "300px" }}
		/>
	);
}
