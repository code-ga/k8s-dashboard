import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	useNavigate,
	useParams,
} from "@tanstack/react-router";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import {
	AlertTriangle,
	ArrowLeft,
	ExternalLink,
	HelpCircle,
	Plus,
	Trash2,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Terminal } from "xterm";
import { DebugPodModal } from "@/components/cluster/debug-pod-modal";
import { ExposeDialog } from "@/components/service/expose-dialog";
import { EnvEditor, type EnvVar } from "@/components/shared/env-editor";
import RefsEditor, {
	type IConfigMapEnvFromRef,
	type IConfigMapEnvRef,
	type ISecretEnvFromRef,
	type ISecretEnvRef,
} from "@/components/shared/refs-editor";
import VolumeMountEditor, {
	type IEmptyDirVolumeMount,
	type IPvcVolumeMount,
} from "@/components/shared/volume-mount-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	api,
	type databaseTypes,
	getEdenErrorMessage,
	type SchemaStatic,
} from "@/lib/api";
import "xterm/css/xterm.css";
import { BACKEND_URL } from "../../../../../constants";
import { logger } from "../../../../../lib/logger";

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

	const { data: livePodData } = useQuery({
		queryKey: ["pod-describe", clusterId, podId],
		queryFn: async () => {
			const res = await api.api
				.pods({ clusterId })({ id: podId })
				.describe.get();
			if (res.error) throw res.error;
			return res.data.data;
		},
		enabled: !!pod,
		refetchInterval: 5000, // Refresh every 5 seconds to catch new containers
	});

	// Extract containers from live data
	const containers = useMemo(() => {
		if (!livePodData?.resource)
			return pod ? [pod.dockerImage.split(":")[0]] : [];
		const resource = livePodData.resource as {
			spec?: {
				containers?: Array<{ name: string }>;
				initContainers?: Array<{ name: string }>;
				ephemeralContainers?: Array<{ name: string }>;
			};
		};
		const specContainers = (resource.spec?.containers || []).map((c) => c.name);
		const initContainers = (resource.spec?.initContainers || []).map(
			(c) => c.name,
		);
		const ephemeralContainers = (resource.spec?.ephemeralContainers || []).map(
			(c) => c.name,
		);
		return [...specContainers, ...initContainers, ...ephemeralContainers];
	}, [livePodData, pod]);

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
	const [pvcVolumes, setPvcVolumes] = useState<IPvcVolumeMount[]>([]);
	const [emptyDirVolumes, setEmptyDirVolumes] = useState<
		IEmptyDirVolumeMount[]
	>([]);

	useEffect(() => {
		if (pod) {
			setImage(pod.dockerImage || "");
			setCommand(pod.command ? pod.command.split(" ") : []);
			setArgs(pod.args ? pod.args.split(" ") : []);
			try {
				if (pod.envVariables) {
					const parsed = JSON.parse(pod.envVariables);
					if (Array.isArray(parsed)) {
						setEnvVars(
							parsed.map((v) => ({
								...v,
								type: v.valueFrom?.fieldRef ? "fieldRef" : "text",
							})),
						);
					} else {
						// Backward compatibility
						setEnvVars(
							Object.entries(parsed as Record<string, string>).map(
								([name, value]) => ({ name, value, type: "text" }),
							),
						);
					}
				} else {
					setEnvVars([]);
				}
			} catch (_e) {
				logger.error("Failed to parse env variables", _e);
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
				} else {
					setConfigMapEnvRefs([]);
					setConfigMapEnvFromRefs([]);
				}
			} catch {
				setConfigMapEnvRefs([]);
				setConfigMapEnvFromRefs([]);
			}

			try {
				if (pod.secretRefs) {
					setSecretEnvRefs(pod.secretRefs.env || []);
					setSecretEnvFromRefs(pod.secretRefs.envFrom || []);
				} else {
					setSecretEnvRefs([]);
					setSecretEnvFromRefs([]);
				}
			} catch {
				setSecretEnvRefs([]);
				setSecretEnvFromRefs([]);
			}

			setPvcVolumes(pod.pvcVolumes || []);
			setEmptyDirVolumes(pod.emptyDirVolumes || []);
		}
	}, [pod]);

	const deleteMutation = useMutation({
		mutationFn: async () => {
			const res = await api.api
				.pods({ clusterId })({ id: podId.toString() })
				.delete();
			if (res.error) {
				throw new Error(getEdenErrorMessage(res.error));
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
			if (!image.trim()) {
				toast.error("Image is required");
				throw new Error("Image is required");
			}

			const envPayload = envVars
				.filter((v) => v.name)
				.map((v) => {
					if (v.type === "fieldRef" || (!v.type && v.valueFrom?.fieldRef)) {
						return { name: v.name, valueFrom: v.valueFrom };
					}
					return { name: v.name, value: v.value };
				});

			for (const v of envVars) {
				if (!v.name && (v.value || v.valueFrom)) {
					toast.error("All environment variables must have a name");
					throw new Error("All environment variables must have a name");
				}
			}

			const labelsMap: Record<string, string> = {};
			for (const l of labels) {
				if (!l.name && l.value) {
					toast.error("All labels must have a key");
					throw new Error("All labels must have a key");
				}
				if (l.name && l.value) labelsMap[l.name] = l.value;
			}

			for (const p of ports) {
				if (p.containerPort < 1 || p.containerPort > 65535) {
					toast.error(`Invalid port: ${p.containerPort}`);
					throw new Error(`Invalid port: ${p.containerPort}`);
				}
			}

			const res = await api.api
				.pods({ clusterId })({ id: podId.toString() })
				.patch({
					image,
					command:
						command.length > 0 && command[0] !== "" ? command : undefined,
					args: args.length > 0 && args[0] !== "" ? args : undefined,
					env: envPayload,
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
					pvcVolumes: pvcVolumes.length > 0 ? pvcVolumes : undefined,
					emptyDirVolumes:
						emptyDirVolumes.length > 0 ? emptyDirVolumes : undefined,
				});
			if (res.error) {
				throw new Error(getEdenErrorMessage(res.error));
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

	if (isLoading)
		return <div className="p-6 text-foreground">Loading pod details...</div>;
	if (!pod) return <div className="p-6 text-foreground">Pod not found</div>;

	return (
		<div className="flex flex-col h-screen bg-background text-foreground">
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
						<DebugPodModal
							clusterId={clusterId}
							podId={podId}
							podName={pod.name}
							containers={containers}
						/>
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
					<TabsList className="grid w-full grid-cols-9 max-w-5xl h-auto bg-transparent p-0 gap-0">
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
							value="volumes"
							className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
						>
							Volumes
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
							value="events"
							className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
						>
							Events
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
						<div className="flex items-center justify-between border-b pb-2">
							<h3 className="text-lg font-semibold flex items-center gap-2">
								Container Configuration
								<HelpCircle className="h-4 w-4 text-muted-foreground" />
							</h3>
							<a
								href="https://kubernetes.io/docs/concepts/workloads/pods/"
								target="_blank"
								rel="noopener noreferrer"
								className="text-xs text-primary hover:underline flex items-center gap-1"
							>
								Pod Docs <ExternalLink className="h-3 w-3" />
							</a>
						</div>
						<div className="space-y-2">
							<Label htmlFor="image">Container Image</Label>
							<Input
								id="image"
								value={image}
								onChange={(e) => setImage(e.target.value)}
								placeholder="e.g., nginx:latest"
							/>
						</div>

						<div className="space-y-4 pt-4 border-t">
							<div className="flex items-center justify-between">
								<h3 className="text-lg font-semibold flex items-center gap-2">
									Lifecycle & Ports
									<HelpCircle className="h-4 w-4 text-muted-foreground" />
								</h3>
								<a
									href="https://kubernetes.io/docs/tasks/inject-data-application/define-command-argument-container/"
									target="_blank"
									rel="noopener noreferrer"
									className="text-xs text-primary hover:underline flex items-center gap-1"
								>
									Exec Docs <ExternalLink className="h-3 w-3" />
								</a>
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

				{/* Volumes Tab */}
				<TabsContent
					value="volumes"
					className="flex-1 overflow-auto p-6 space-y-6"
				>
					<RecreationWarning />
					<div className="space-y-6">
						<div className="flex items-center justify-between border-b pb-2">
							<h3 className="text-lg font-semibold flex items-center gap-2">
								Storage & Volume Mounts
								<HelpCircle className="h-4 w-4 text-muted-foreground" />
							</h3>
							<a
								href="https://kubernetes.io/docs/concepts/storage/volumes/"
								target="_blank"
								rel="noopener noreferrer"
								className="text-xs text-primary hover:underline flex items-center gap-1"
							>
								Volume Docs <ExternalLink className="h-3 w-3" />
							</a>
						</div>
						<VolumeMountEditor
							clusterId={clusterId}
							pvcVolumes={pvcVolumes}
							emptyDirVolumes={emptyDirVolumes}
							onChange={(v) => {
								setPvcVolumes(v.pvcVolumes);
								setEmptyDirVolumes(v.emptyDirVolumes);
							}}
						/>
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
						<div className="flex items-center justify-between border-b pb-2">
							<h3 className="text-lg font-semibold flex items-center gap-2">
								Environment Configuration
								<HelpCircle className="h-4 w-4 text-muted-foreground" />
							</h3>
							<a
								href="https://kubernetes.io/docs/tasks/inject-data-application/define-environment-variable-container/"
								target="_blank"
								rel="noopener noreferrer"
								className="text-xs text-primary hover:underline flex items-center gap-1"
							>
								Env Docs <ExternalLink className="h-3 w-3" />
							</a>
						</div>
						<div>
							<h3 className="text-sm font-semibold mb-4 text-foreground">
								Environment Variables
							</h3>
							<EnvEditor variables={envVars} onChange={setEnvVars} />
						</div>
						<div>
							<h3 className="text-sm font-semibold mb-4 text-foreground">
								References
							</h3>
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
					<div className="flex items-center justify-between border-b pb-2 max-w-2xl">
						<h3 className="text-lg font-semibold flex items-center gap-2">
							Resource Management
							<HelpCircle className="h-4 w-4 text-muted-foreground" />
						</h3>
						<a
							href="https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/"
							target="_blank"
							rel="noopener noreferrer"
							className="text-xs text-primary hover:underline flex items-center gap-1"
						>
							Resource Docs <ExternalLink className="h-3 w-3" />
						</a>
					</div>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-2xl">
						<div className="space-y-4">
							<h3 className="text-sm font-semibold border-b pb-2 text-foreground">
								Requests
							</h3>
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
							<h3 className="text-sm font-semibold border-b pb-2 text-foreground">
								Limits
							</h3>
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
					<div className="flex items-center justify-between border-b pb-2 max-w-2xl">
						<h3 className="text-lg font-semibold flex items-center gap-2">
							Labels & Metadata
							<HelpCircle className="h-4 w-4 text-muted-foreground" />
						</h3>
						<a
							href="https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/"
							target="_blank"
							rel="noopener noreferrer"
							className="text-xs text-primary hover:underline flex items-center gap-1"
						>
							Label Docs <ExternalLink className="h-3 w-3" />
						</a>
					</div>
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
						containers={containers}
					/>
				</TabsContent>

				{/* Events Tab */}
				<TabsContent
					value="events"
					className="flex-1 overflow-auto p-6 flex flex-col"
				>
					<PodEvents
						events={
							(livePodData?.events || []) as Array<{
								lastSeen: string;
								type: string;
								reason: string;
								message: string;
								object: string;
								namespace: string;
							}>
						}
						isActive={activeTab === "events"}
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
						containers={containers}
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
	containers: string[];
}

export function PodLogs({
	pod,
	clusterId,
	isActive,
	containers,
}: PodLogsProps) {
	const [logs, setLogs] = useState<string>("");
	const [autoScroll, setAutoScroll] = useState(true);
	const [selectedContainer, setSelectedContainer] = useState(
		containers[0] || "",
	);
	const logsRef = useRef<HTMLPreElement>(null);
	const wsRef = useRef<WebSocket | null>(null);

	// Reset logs when the log tab becomes active or when the selected container is no longer available.
	useEffect(() => {
		if (isActive) {
			setLogs("");
		}
	}, [isActive]);

	useEffect(() => {
		if (isActive && !containers.includes(selectedContainer)) {
			setSelectedContainer(containers[0] || "");
			setLogs("");
		}
	}, [isActive, containers, selectedContainer]);

	useEffect(() => {
		if (!isActive) {
			wsRef.current?.close();
			wsRef.current = null;
			return;
		}

		let ws: WebSocket | null = null;
		let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
		let isUnmounting = false;

		const connect = () => {
			if (isUnmounting) return;

			const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
			const backendUrl = new URL(BACKEND_URL);
			ws = new WebSocket(
				`${protocol}//${backendUrl.host}/api/pods/${clusterId}/logs/${pod.id}?container=${selectedContainer}`,
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
				logger.error("WebSocket error:", error);
			};

			ws.onclose = (event) => {
				logger.info("WebSocket closed", event.code, event.reason);
				if (!event.wasClean && !isUnmounting && isActive) {
					setLogs(
						(prev) =>
							prev +
							"\r\n\x1b[33mConnection lost. Reconnecting in 3 seconds...\x1b[0m\r\n",
					);
					reconnectTimeout = setTimeout(connect, 3000);
				}
			};
		};

		connect();

		return () => {
			isUnmounting = true;
			if (reconnectTimeout) clearTimeout(reconnectTimeout);
			ws?.close();
			wsRef.current = null;
		};
	}, [isActive, selectedContainer, clusterId, pod.id]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: auto-scroll logic
	useEffect(() => {
		if (autoScroll && logsRef.current) {
			logsRef.current.scrollTop = logsRef.current.scrollHeight;
		}
	}, [logs, autoScroll]);

	return (
		<div className="h-full flex flex-col gap-3 text-foreground">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-4">
					<div className="text-sm font-medium text-foreground">
						Live Pod Logs
					</div>
					<Select
						value={selectedContainer}
						onValueChange={(val) => {
							setLogs("");
							setSelectedContainer(val);
						}}
					>
						<SelectTrigger className="w-[200px] h-8 text-xs">
							<SelectValue placeholder="Select container" />
						</SelectTrigger>
						<SelectContent>
							{containers.map((c) => (
								<SelectItem key={c} value={c}>
									{c}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
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
	containers: string[];
}

export function PodTerminal({
	pod,
	clusterId,
	isActive,
	containers,
}: PodTerminalProps) {
	const [selectedContainer, setSelectedContainer] = useState(
		containers[0] || "",
	);
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
					logger.warn("Fit error:", e);
				}
			}

			xtermRef.current = term;
			fitAddonRef.current = fitAddon;

			// Connect WebSocket
			const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
			const backendUrl = new URL(BACKEND_URL);
			ws = new WebSocket(
				`${protocol}//${backendUrl.host}/api/pods/${clusterId}/exec/${pod.id}?container=${selectedContainer}`,
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
	}, [isActive, pod.id, clusterId, sendResize, selectedContainer]);

	return (
		<div className="h-full flex flex-col gap-3">
			<div className="flex items-center gap-4">
				<span className="text-sm font-medium">Target Container:</span>
				<Select value={selectedContainer} onValueChange={setSelectedContainer}>
					<SelectTrigger className="w-[200px] h-8 text-xs">
						<SelectValue placeholder="Select container" />
					</SelectTrigger>
					<SelectContent>
						{containers.map((c) => (
							<SelectItem key={c} value={c}>
								{c}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<div
				ref={terminalRef}
				className="flex-1 w-full rounded-lg overflow-hidden"
				style={{ minHeight: "300px" }}
			/>
		</div>
	);
}

interface PodEventsProps {
	events: Array<{
		lastSeen: string;
		type: string;
		reason: string;
		message: string;
		object: string;
		namespace: string;
	}>;
	isActive: boolean;
}

export function PodEvents({ events }: PodEventsProps) {
	return (
		<div className="flex-1 overflow-hidden flex flex-col gap-4">
			<div className="flex items-center justify-between">
				<h3 className="text-sm font-semibold text-foreground italic opacity-70">
					Recent events for this pod
				</h3>
			</div>

			<div className="flex-1 border rounded-lg overflow-auto">
				<Table>
					<TableHeader className="bg-muted/50 sticky top-0 z-10">
						<TableRow>
							<TableHead className="w-[180px]">Last Seen</TableHead>
							<TableHead className="w-[100px]">Type</TableHead>
							<TableHead className="w-[150px]">Reason</TableHead>
							<TableHead>Message</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{events.length === 0 ? (
							<TableRow>
								<TableCell
									colSpan={4}
									className="text-center h-24 text-muted-foreground italic"
								>
									No events found in the last hour
								</TableCell>
							</TableRow>
						) : (
							events.map((e, i) => (
								<TableRow
									key={`${e.lastSeen}-${e.reason}-${i}`}
									className="hover:bg-muted/30 transition-colors"
								>
									<TableCell className="text-[10px] font-mono whitespace-nowrap">
										{new Date(e.lastSeen).toLocaleString()}
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
									<TableCell className="text-xs text-muted-foreground max-w-md truncate hover:whitespace-normal cursor-help">
										{e.message}
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}
