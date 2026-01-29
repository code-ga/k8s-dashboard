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
import { api } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Settings, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { WebLinksAddon } from "xterm-addon-web-links";
import "xterm/css/xterm.css";

interface Pod {
	id: number;
	name: string;
	namespace: string;
	nodeName: string;
	dockerImage: string;
	status: string;
	cpuRequest: number;
	cpuLimit: number;
	memoryRequest: number;
	memoryLimit: number;
}

interface ManagePodDialogProps {
	pod: Pod;
	clusterId: string;
}

export function ManagePodDialog({ pod, clusterId }: ManagePodDialogProps) {
	const [open, setOpen] = useState(false);
	const [activeTab, setActiveTab] = useState("overview");
	const queryClient = useQueryClient();

	const deleteMutation = useMutation({
		mutationFn: async () => {
			const res = await api.api.pods({ clusterId })[pod.id.toString()].delete();
			if (res.error) {
				throw new Error(res.error.value?.message || "Failed to delete pod");
			}
			return res.data;
		},
		onSuccess: () => {
			toast.success("Pod deleted successfully");
			queryClient.invalidateQueries({ queryKey: ["pods", clusterId] });
			setOpen(false);
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="ghost" size="sm">
					<Settings className="h-4 w-4" />
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[800px] h-[600px] flex flex-col">
				<DialogHeader>
					<DialogTitle>Manage Pod: {pod.name}</DialogTitle>
					<DialogDescription>
						View details, stream logs, or access the terminal for this pod.
					</DialogDescription>
				</DialogHeader>

				<Tabs
					value={activeTab}
					onValueChange={setActiveTab}
					className="flex-1 flex flex-col"
				>
					<TabsList className="grid w-full grid-cols-3">
						<TabsTrigger value="overview">Overview</TabsTrigger>
						<TabsTrigger value="logs">Logs</TabsTrigger>
						<TabsTrigger value="terminal">Terminal</TabsTrigger>
					</TabsList>

					<TabsContent
						value="overview"
						className="flex-1 overflow-auto space-y-4"
					>
						<div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
							<div>
								<label className="text-sm font-medium text-muted-foreground">
									Name
								</label>
								<p className="font-mono">{pod.name}</p>
							</div>
							<div>
								<label className="text-sm font-medium text-muted-foreground">
									Namespace
								</label>
								<p className="font-mono">{pod.namespace}</p>
							</div>
							<div>
								<label className="text-sm font-medium text-muted-foreground">
									Status
								</label>
								<p className="font-mono">{pod.status}</p>
							</div>
							<div>
								<label className="text-sm font-medium text-muted-foreground">
									Node
								</label>
								<p className="font-mono">{pod.nodeName}</p>
							</div>
							<div className="col-span-2">
								<label className="text-sm font-medium text-muted-foreground">
									Image
								</label>
								<p className="font-mono">{pod.dockerImage}</p>
							</div>
							<div>
								<label className="text-sm font-medium text-muted-foreground">
									CPU Request/Limit
								</label>
								<p className="font-mono">
									{pod.cpuRequest}m / {pod.cpuLimit}m
								</p>
							</div>
							<div>
								<label className="text-sm font-medium text-muted-foreground">
									Memory Request/Limit
								</label>
								<p className="font-mono">
									{pod.memoryRequest}Mi / {pod.memoryLimit}Mi
								</p>
							</div>
						</div>

						<Button
							variant="destructive"
							onClick={() => deleteMutation.mutate()}
							disabled={deleteMutation.isPending}
						>
							<Trash2 className="h-4 w-4 mr-2" />
							{deleteMutation.isPending ? "Deleting..." : "Delete Pod"}
						</Button>
					</TabsContent>

					<TabsContent value="logs" className="flex-1 overflow-hidden">
						<PodLogs
							pod={pod}
							clusterId={clusterId}
							isActive={activeTab === "logs"}
						/>
					</TabsContent>

					<TabsContent value="terminal" className="flex-1 overflow-hidden">
						<PodTerminal
							pod={pod}
							clusterId={clusterId}
							isActive={activeTab === "terminal"}
						/>
					</TabsContent>
				</Tabs>
			</DialogContent>
		</Dialog>
	);
}

interface PodLogsProps {
	pod: Pod;
	clusterId: string;
	isActive: boolean;
}

function PodLogs({ pod, clusterId, isActive }: PodLogsProps) {
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
			`${protocol}//${window.location.host}/api/pods/${clusterId}/logs/${pod.id}`,
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

	useEffect(() => {
		if (autoScroll && logsRef.current) {
			logsRef.current.scrollTop = logsRef.current.scrollHeight;
		}
	}, [logs, autoScroll]);

	return (
		<div className="h-full flex flex-col">
			<div className="flex items-center justify-between mb-2">
				<label className="text-sm font-medium">Live Logs</label>
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
	pod: Pod;
	clusterId: string;
	isActive: boolean;
}

function PodTerminal({ pod, clusterId, isActive }: PodTerminalProps) {
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

		// Initialize xterm
		const term = new Terminal({
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
		fitAddon.fit();

		xtermRef.current = term;
		fitAddonRef.current = fitAddon;

		// Connect WebSocket
		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
		const ws = new WebSocket(
			`${protocol}//${window.location.host}/api/pods/${clusterId}/exec/${pod.id}`,
		);
		wsRef.current = ws;

		ws.binaryType = "arraybuffer";

		ws.onopen = () => {
			term.write("\x1b[33mConnecting to pod terminal...\x1b[0m\r\n");
			// Send initial size
			sendResize(term.cols, term.rows);
		};

		ws.onmessage = (event) => {
			if (event.data instanceof ArrayBuffer) {
				term.write(new Uint8Array(event.data));
			} else {
				term.write(event.data);
			}
		};

		ws.onerror = () => {
			term.write("\x1b[31mError connecting to terminal\x1b[0m\r\n");
		};

		ws.onclose = () => {
			term.write("\x1b[31m\r\nConnection closed\x1b[0m\r\n");
		};

		// Send user input to WebSocket
		term.onData((data) => {
			if (ws.readyState === WebSocket.OPEN) {
				ws.send(data);
			}
		});

		// Handle resize
		const resizeObserver = new ResizeObserver(() => {
			fitAddon.fit();
			sendResize(term.cols, term.rows);
		});
		resizeObserver.observe(terminalRef.current);

		return () => {
			resizeObserver.disconnect();
			term.dispose();
			ws.close();
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
