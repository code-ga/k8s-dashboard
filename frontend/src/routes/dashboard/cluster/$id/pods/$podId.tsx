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
import { BACKEND_URL } from "@/constants";
import { api, type databaseTypes, type SchemaStatic } from "@/lib/api";
import "xterm/css/xterm.css";

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
		<div className="bg-yellow-500/10 border border-yellow-500/50 rounded-lg p-3 flex gap-3 items-start mb-4">
			<AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
			<div className="text-sm text-yellow-200">
				<span className="font-bold text-yellow-500">Warning:</span> Saving
				changes will cause the pod to be deleted and recreated. Active
				connections like logs or terminal will be interrupted.
			</div>
		</div>
	);

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
				<TabsList className="grid w-full grid-cols-7 max-w-4xl">
					<TabsTrigger value="overview">Overview</TabsTrigger>
					<TabsTrigger value="config">Config</TabsTrigger>
					<TabsTrigger value="env">Env</TabsTrigger>
					<TabsTrigger value="resources">Resources</TabsTrigger>
					<TabsTrigger value="labels">Labels</TabsTrigger>
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
						>
							<Trash2 className="h-4 w-4 mr-2" />
							{deleteMutation.isPending ? "Deleting..." : "Delete Pod"}
						</Button>
					</div>
				</TabsContent>

				<TabsContent
					value="config"
					className="flex-1 overflow-auto pt-4 space-y-4"
				>
					<RecreationWarning />
					<div className="space-y-4 max-w-2xl">
						<div className="grid gap-2">
							<Label>Image</Label>
							<Input value={image} onChange={(e) => setImage(e.target.value)} />
						</div>
						<div className="grid gap-2">
							<Label>Command (space-separated)</Label>
							<Input
								value={command.join(" ")}
								onChange={(e) => setCommand(e.target.value.split(" "))}
							/>
						</div>
						<div className="grid gap-2">
							<Label>Arguments (space-separated)</Label>
							<Input
								value={args.join(" ")}
								onChange={(e) => setArgs(e.target.value.split(" "))}
							/>
						</div>
						<div className="space-y-2">
							<div className="flex items-center justify-between">
								<Label>Ports</Label>
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
					<div className="flex justify-end pt-4">
						<Button
							onClick={() => savePodMutation.mutate()}
							disabled={savePodMutation.isPending}
						>
							{savePodMutation.isPending ? "Updating..." : "Update Pod"}
						</Button>
					</div>
				</TabsContent>

				<TabsContent
					value="env"
					className="flex-1 overflow-auto pt-4 space-y-4"
				>
					<RecreationWarning />
					<EnvEditor variables={envVars} onChange={setEnvVars} />
					<div className="pt-4">
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
					<div className="flex justify-end pt-4">
						<Button
							onClick={() => savePodMutation.mutate()}
							disabled={savePodMutation.isPending}
						>
							{savePodMutation.isPending ? "Updating..." : "Update Pod"}
						</Button>
					</div>
				</TabsContent>

				<TabsContent
					value="resources"
					className="flex-1 overflow-auto pt-4 space-y-4"
				>
					<RecreationWarning />
					<div className="grid grid-cols-2 gap-8 max-w-2xl">
						<div className="space-y-4">
							<h3 className="text-sm font-semibold border-b pb-1">Requests</h3>
							<div className="grid gap-2">
								<Label>CPU (m)</Label>
								<Input
									value={cpuRequest}
									onChange={(e) => setCpuRequest(e.target.value)}
								/>
							</div>
							<div className="grid gap-2">
								<Label>Memory (Mi)</Label>
								<Input
									value={memoryRequest}
									onChange={(e) => setMemoryRequest(e.target.value)}
								/>
							</div>
						</div>
						<div className="space-y-4">
							<h3 className="text-sm font-semibold border-b pb-1">Limits</h3>
							<div className="grid gap-2">
								<Label>CPU (m)</Label>
								<Input
									value={cpuLimit}
									onChange={(e) => setCpuLimit(e.target.value)}
								/>
							</div>
							<div className="grid gap-2">
								<Label>Memory (Mi)</Label>
								<Input
									value={memoryLimit}
									onChange={(e) => setMemoryLimit(e.target.value)}
								/>
							</div>
						</div>
					</div>
					<div className="flex justify-end pt-4">
						<Button
							onClick={() => savePodMutation.mutate()}
							disabled={savePodMutation.isPending}
						>
							{savePodMutation.isPending ? "Updating..." : "Update Pod"}
						</Button>
					</div>
				</TabsContent>

				<TabsContent
					value="labels"
					className="flex-1 overflow-auto pt-4 space-y-4"
				>
					<RecreationWarning />
					<EnvEditor variables={labels} onChange={setLabels} />
					<div className="flex justify-end pt-4">
						<Button
							onClick={() => savePodMutation.mutate()}
							disabled={savePodMutation.isPending}
						>
							{savePodMutation.isPending ? "Updating..." : "Update Pod"}
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
		<div className="h-full flex flex-col">
			<div className="flex items-center justify-between mb-2">
				<div className="text-sm font-medium">Live Logs</div>
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
			const backendUrl = new URL(BACKEND_URL);
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
