import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	useNavigate,
	useParams,
} from "@tanstack/react-router";
import {
	AlertTriangle,
	ArrowLeft,
	Box,
	ExternalLink,
	HelpCircle,
	Plus,
	RefreshCw,
	Settings,
	Trash2,
	X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
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
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { BACKEND_URL } from "../../../../../../constants";
import { logger } from "../../../../../../lib/logger";

export const Route = createFileRoute(
	"/_protected/dashboard/cluster/$id/deployments/$deploymentId",
)({
	component: ManageDeploymentPage,
});

function ManageDeploymentPage() {
	const { id: clusterId, deploymentId } = useParams({
		from: "/_protected/dashboard/cluster/$id/deployments/$deploymentId",
	});
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [activeTab, setActiveTab] = useState("overview");

	const { data: deployment, isLoading } = useQuery({
		queryKey: ["deployment", clusterId, deploymentId],
		queryFn: async () => {
			const res = await api.api
				.deployments({ clusterId })({ id: deploymentId })
				.get()
			if (res.error) throw res.error;
			if (!res.data.data)
				throw new Error(res.data.message || "Failed to fetch deployment");
			return res.data.data;
		},
	});

	const { data: allPods = [] } = useQuery({
		queryKey: ["pods", clusterId],
		queryFn: async () => {
			const res = await api.api.pods({ clusterId: clusterId }).get();
			if (res.error) throw res.error;
			if (!res.data.data)
				throw new Error(res.data.message || "Failed to fetch pods");
			return res.data.data;
		},
	});

	const deploymentPods = allPods.filter((pod) => {
		if (!deployment) return false;
		const selector = deployment.selector
			? JSON.parse(deployment.selector)
			: { app: deployment.name };

		let podLabels: Record<string, string> = {};
		try {
			if (pod.labels) {
				podLabels =
					typeof pod.labels === "string" ? JSON.parse(pod.labels) : pod.labels;
			}
		} catch {
			podLabels = {};
		}

		return Object.entries(selector).every(
			([key, value]) => podLabels && podLabels[key] === value,
		)
	});

	const [image, setImage] = useState("");
	const [command, setCommand] = useState<string[]>([]);
	const [args, setArgs] = useState<string[]>([]);
	const [envVars, setEnvVars] = useState<EnvVar[]>([]);
	const [configMapEnvRefs, setConfigMapEnvRefs] = useState<IConfigMapEnvRef[]>(
		[],
	)
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
	const [pvcVolumes, setPvcVolumes] = useState<IPvcVolumeMount[]>([]);
	const [emptyDirVolumes, setEmptyDirVolumes] = useState<
		IEmptyDirVolumeMount[]
	>([]);

	useEffect(() => {
		if (deployment) {
			setImage(deployment.dockerImage || "");
			setReplicas(deployment.replicas);
			setCommand(deployment.command ? deployment.command.split(" ") : []);
			setArgs(deployment.args ? deployment.args.split(" ") : []);
			try {
				if (deployment.envVariables) {
					const parsed = JSON.parse(deployment.envVariables);
					if (Array.isArray(parsed)) {
						setEnvVars(
							parsed.map((v) => ({
								...v,
								type: v.valueFrom?.fieldRef ? "fieldRef" : "text",
							})),
						)
					} else {
						// Backward compatibility
						setEnvVars(
							Object.entries(parsed as Record<string, string>).map(
								([name, value]) => ({ name, value, type: "text" }),
							),
						)
					}
				} else {
					setEnvVars([]);
				}
			} catch (_e) {
				logger.error("Failed to parse env variables", _e);
				setEnvVars([]);
			}
			setPorts(
				Array.isArray(deployment.ports)
					? deployment.ports
					: (deployment.ports as any)?.data || [], // fallback for backward compatibility
			)
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
					)
				} else {
					setLabels([])
				}
			} catch (_e) {
				setLabels([]);
			}

			// load refs
			try {
				if (deployment.configMapRefs) {
					setConfigMapEnvRefs(deployment.configMapRefs.env || []);
					setConfigMapEnvFromRefs(deployment.configMapRefs.envFrom || []);
				} else {
					setConfigMapEnvRefs([]);
					setConfigMapEnvFromRefs([]);
				}
			} catch {
				setConfigMapEnvRefs([]);
				setConfigMapEnvFromRefs([]);
			}

			try {
				if (deployment.secretRefs) {
					setSecretEnvRefs(deployment.secretRefs.env || []);
					setSecretEnvFromRefs(deployment.secretRefs.envFrom || []);
				} else {
					setSecretEnvRefs([]);
					setSecretEnvFromRefs([]);
				}
			} catch {
				setSecretEnvRefs([]);
				setSecretEnvFromRefs([]);
			}

			setPvcVolumes(deployment.pvcVolumes || []);
			setEmptyDirVolumes(deployment.emptyDirVolumes || []);
		}
	}, [deployment]);

	const saveDeploymentMutation = useMutation({
		mutationFn: async () => {
			if (!image.trim()) {
				toast.error("Image is required");
				throw new Error("Image is required");
			}
			if (replicas < 0) {
				toast.error("Replicas must be at least 0");
				throw new Error("Replicas must be at least 0");
			}

			const envPayload = envVars
				.filter((v) => v.name)
				.map((v) => {
					if (v.type === "fieldRef" || (!v.type && v.valueFrom?.fieldRef)) {
						return { name: v.name, valueFrom: v.valueFrom };
					}
					return { name: v.name, value: v.value };
				})

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
				.deployments({ clusterId })({ id: deploymentId.toString() })
				.patch({
					image,
					replicas,
					command:
						command.length > 0 && command[0] !== "" ? command : undefined,
					args: args.length > 0 && args[0] !== "" ? args : undefined,
					env: envPayload,
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
					pvcVolumes: pvcVolumes.length > 0 ? pvcVolumes : undefined,
					emptyDirVolumes:
						emptyDirVolumes.length > 0 ? emptyDirVolumes : undefined,
				})
			if (res.error) {
				const message = getEdenErrorMessage(res.error);
				throw new Error(message);
			}
			return res.data;
		},
		onSuccess: () => {
			toast.success("Deployment update initiated");
			queryClient.invalidateQueries({ queryKey: ["deployments", clusterId] });
			queryClient.invalidateQueries({
				queryKey: ["deployment", clusterId, deploymentId],
			})
		},
		onError: (error: Error) => {
			toast.error(error.message);
		},
	});

	const deleteMutation = useMutation({
		mutationFn: async () => {
			const res = await api.api
				.deployments({ clusterId })({ id: deploymentId.toString() })
				.delete()
			if (res.error) {
				const message = getEdenErrorMessage(res.error);
				throw new Error(message);
			}
			return res.data;
		},
		onSuccess: () => {
			toast.success("Deployment deleted successfully");
			queryClient.invalidateQueries({ queryKey: ["deployments", clusterId] });
			navigate({
				to: `/dashboard/cluster/$id/deployments`,
				params: { id: clusterId },
			})
		},
		onError: (error: Error) => {
			toast.error(error.message);
		},
	});

	const redeployMutation = useMutation({
		mutationFn: async () => {
			const res = await api.api
				.deployments({ clusterId })({ id: deploymentId.toString() })
				.redeploy.patch();
			if (res.error) {
				const message = getEdenErrorMessage(res.error);
				throw new Error(message);
			}
			return res.data;
		},
		onSuccess: () => {
			toast.success("Deployment re-deployment triggered");
			queryClient.invalidateQueries({
				queryKey: ["deployment", clusterId, deploymentId],
			})
			queryClient.invalidateQueries({ queryKey: ["pods", clusterId] });
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
	)

	if (isLoading)
		return (
			<div className="p-6 text-foreground">Loading deployment details...</div>
		)
	if (!deployment)
		return <div className="p-6 text-foreground">Deployment not found</div>;

	const selector = deployment.selector
		? JSON.parse(deployment.selector)
		: { app: deployment.name };

	return (
		<div className="flex flex-col h-screen bg-background text-foreground">
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
							defaultInternalPort={
								(deployment.ports as any)?.data?.[0]?.containerPort ||
								(Array.isArray(deployment.ports)
									? deployment.ports[0]?.containerPort
									: 0) ||
								80
							}
							selector={selector}
						/>
						<Button
							variant="outline"
							onClick={() => {
								if (
									confirm(
										"Are you sure you want to trigger a rolling restart for this deployment?",
									)
								) {
									redeployMutation.mutate()
								}
							}}
							disabled={redeployMutation.isPending}
							size="sm"
						>
							<RefreshCw
								className={`h-4 w-4 mr-2 ${redeployMutation.isPending ? "animate-spin" : ""}`}
							/>
							{redeployMutation.isPending ? "Re-deploying..." : "Re-deploy"}
						</Button>
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
					<TabsList className="grid w-full grid-cols-8 max-w-5xl h-auto bg-transparent p-0 gap-0">
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
						<div className="flex items-center justify-between border-b pb-2">
							<h3 className="text-lg font-semibold flex items-center gap-2">
								Container Configuration
								<HelpCircle className="h-4 w-4 text-muted-foreground" />
							</h3>
							<a
								href="https://kubernetes.io/docs/concepts/workloads/controllers/deployment/"
								target="_blank"
								rel="noopener noreferrer"
								className="text-xs text-primary hover:underline flex items-center gap-1"
							>
								Deployment Docs <ExternalLink className="h-3 w-3" />
							</a>
						</div>
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
											key={"${p.containerPort}-${i}"}
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
														const newPorts = [...ports]
														newPorts[i].containerPort = Number(e.target.value);
														setPorts(newPorts)
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
														const newPorts = [...ports]
														newPorts[i].name = e.target.value
														setPorts(newPorts)
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
							onClick={() => saveDeploymentMutation.mutate()}
							disabled={saveDeploymentMutation.isPending}
						>
							{saveDeploymentMutation.isPending
								? "Updating..."
								: "Update Deployment"}
						</Button>
					</div>
				</TabsContent>

				{/* Events Tab */}
				<TabsContent
					value="events"
					className="flex-1 overflow-auto p-6 flex flex-col"
				>
					<DeploymentEvents
						deploymentId={deploymentId}
						clusterId={clusterId}
						isActive={activeTab === "events"}
					/>
				</TabsContent>

				{/* Pods Tab */}
				<TabsContent value="pods" className="flex-1 overflow-auto p-6">
					<div className="space-y-4">
						<div className="flex items-center justify-between">
							<div>
								<h3 className="text-lg font-semibold">
									Pods ({deploymentPods.length})
								</h3>
								<p className="text-sm text-muted-foreground">
									Pods managed by this deployment
								</p>
							</div>
						</div>

						<Card>
							<CardContent className="p-0">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Name</TableHead>
											<TableHead>Namespace</TableHead>
											<TableHead>Status</TableHead>
											<TableHead>Image</TableHead>
											<TableHead>CPU / MEM</TableHead>
											<TableHead className="text-right">Actions</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{deploymentPods?.map((pod) => (
											<TableRow key={pod.id}>
												<TableCell className="font-medium flex items-center gap-2">
													<Box className="h-4 w-4 text-blue-500" />
													{pod.name}
												</TableCell>
												<TableCell>{pod.namespace}</TableCell>
												<TableCell>{pod.status || "Running"}</TableCell>
												<TableCell
													className="max-w-[200px] truncate"
													title={pod.dockerImage}
												>
													{pod.dockerImage}
												</TableCell>
												<TableCell>
													{pod.cpuRequest}m / {pod.memoryRequest}Mi
												</TableCell>
												<TableCell className="text-right">
													<Link
														to="/dashboard/cluster/$id/pods/$podId"
														params={{
															id: clusterId,
															podId: pod.id.toString(),
														}}
													>
														<Button variant="ghost" size="sm">
															<Settings className="h-4 w-4" />
														</Button>
													</Link>
												</TableCell>
											</TableRow>
										))}
										{(!deploymentPods || deploymentPods.length === 0) && (
											<TableRow>
												<TableCell colSpan={6} className="text-center py-4">
													No pods found for this deployment
												</TableCell>
											</TableRow>
										)}
									</TableBody>
								</Table>
							</CardContent>
						</Card>
					</div>
				</TabsContent>

				{/* Logs Tab */}
				<TabsContent
					value="logs"
					className="flex-1 overflow-hidden p-6 flex flex-col"
				>
					<DeploymentLogs
						deployment={
							deployment as unknown as SchemaStatic<
								databaseTypes.databaseTypes["k8sDeployments"]
							>
						}
						clusterId={clusterId}
						isActive={activeTab === "logs"}
					/>
				</TabsContent>
			</Tabs>
		</div>
	)
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
			return
		}

		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
		const backendUrl = new URL(BACKEND_URL);
		const ws = new WebSocket(
			`${protocol}//${backendUrl.host}/api/deployments/${clusterId}/logs/${deployment.id}`,
		)
		wsRef.current = ws;

		ws.onmessage = (event) => {
			if (event.data instanceof Blob) {
				event.data.text().then((text) => {
					setLogs((prev) => prev + text);
				})
			} else {
				setLogs((prev) => prev + event.data);
			}
		}

		ws.onerror = (error) => {
			logger.error("WebSocket error:", error);
			toast.error("Failed to connect to log stream");
		}

		return () => {
			ws.close();
			wsRef.current = null;
		}
	}, [isActive, deployment.id, clusterId]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: reason
	useEffect(() => {
		if (autoScroll && logsRef.current) {
			logsRef.current.scrollTop = logsRef.current.scrollHeight;
		}
	}, [logs, autoScroll]);

	return (
		<div className="h-full flex flex-col gap-3 text-foreground">
			<div className="flex items-center justify-between">
				<p className="text-sm font-medium text-foreground">
					Live Deployment Logs
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
	)
}

interface DeploymentEventsProps {
	deploymentId: string;
	clusterId: string;
	isActive: boolean;
}

export function DeploymentEvents({
	deploymentId,
	clusterId,
	isActive,
}: DeploymentEventsProps) {
	const { data, isLoading, error } = useQuery({
		queryKey: ["deployment-describe", clusterId, deploymentId],
		queryFn: async () => {
			const res = await api.api
				.deployments({ clusterId })({ id: deploymentId })
				.describe.get();
			if (res.error) throw res.error;
			return res.data.data;
		},
		enabled: isActive,
	});

	if (isLoading)
		return (
			<div className="flex-1 flex items-center justify-center p-12">
				<div className="text-sm text-muted-foreground animate-pulse">
					Fetching deployment events from agent...
				</div>
			</div>
		)

	if (error)
		return (
			<div className="flex-1 flex items-center justify-center p-12">
				<div className="text-sm text-destructive font-semibold">
					Error: {(error as Error).message}
				</div>
			</div>
		)

	const events = (data?.events || []) as Array<{
		lastSeen: string;
		type: string;
		reason: string;
		message: string;
		object: string;
		namespace: string;
	}>;

	return (
		<div className="flex-1 overflow-hidden flex flex-col gap-4">
			<div className="flex items-center justify-between">
				<h3 className="text-sm font-semibold text-foreground italic opacity-70">
					Recent events for this deployment
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
	)
}
