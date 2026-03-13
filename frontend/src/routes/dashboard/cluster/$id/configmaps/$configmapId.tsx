import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	useNavigate,
	useParams,
} from "@tanstack/react-router";
import { ArrowLeft, Edit2, Save, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { EnvVar } from "@/components/shared/env-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, getEdenErrorMessage } from "@/lib/api";

export const Route = createFileRoute(
	"/dashboard/cluster/$id/configmaps/$configmapId",
)({
	component: ManageConfigMapPage,
});

function ManageConfigMapPage() {
	const { id: clusterId, configmapId } = useParams({
		from: "/dashboard/cluster/$id/configmaps/$configmapId",
	});
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [activeTab, setActiveTab] = useState("overview");
	const [isEditing, setIsEditing] = useState(false);
	const [editDataVars, setEditDataVars] = useState<EnvVar[]>([]);
	const [editBinaryDataVars, setEditBinaryDataVars] = useState<EnvVar[]>([]);
	const [editLabels, setEditLabels] = useState<EnvVar[]>([]);

	const { data: cm, isLoading } = useQuery({
		queryKey: ["configmap", clusterId, configmapId],
		queryFn: async () => {
			const res = await api.api
				.configmaps({ clusterId })({ id: configmapId })
				.get();
			if (res.error) throw res.error;
			if (!res.data.data)
				throw new Error(res.data.message || "Failed to fetch config map");
			return res.data.data;
		},
	});

	const [dataVars, setDataVars] = useState<EnvVar[]>([]);
	const [binaryDataVars, setBinaryDataVars] = useState<EnvVar[]>([]);
	const [labels, setLabels] = useState<EnvVar[]>([]);

	const startEdit = () => {
		setEditDataVars([...dataVars]);
		setEditBinaryDataVars([...binaryDataVars]);
		setEditLabels([...labels]);
		setIsEditing(true);
	};

	const cancelEdit = () => {
		setIsEditing(false);
		setEditDataVars([]);
		setEditBinaryDataVars([]);
		setEditLabels([]);
	};

	const saveEdit = () => {
		updateMutation.mutate();
	};

	const updateMutation = useMutation({
		mutationFn: async () => {
			const data: Record<string, string> = {};
			editDataVars.forEach((v) => {
				if (v.name && v.value) data[v.name] = v.value;
			});

			const binaryData: Record<string, string> = {};
			editBinaryDataVars.forEach((v) => {
				if (v.name && v.value) binaryData[v.name] = v.value;
			});

			const labelData: Record<string, string> = {};
			editLabels.forEach((v) => {
				if (v.name && v.value) labelData[v.name] = v.value;
			});

			const res = await api.api
				.configmaps({ clusterId })({ id: configmapId })
				.put({
					data,
					binaryData,
					labels: labelData,
				});
			if (res.error) {
				throw new Error(getEdenErrorMessage(res.error));
			}
			return res.data;
		},
		onSuccess: () => {
			toast.success("ConfigMap updated successfully");
			queryClient.invalidateQueries({
				queryKey: ["configmap", clusterId, configmapId],
			});
			setIsEditing(false);
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});

	useEffect(() => {
		if (cm) {
			if (cm.data) {
				setDataVars(
					Object.entries(cm.data).map(([name, value]) => ({
						name,
						value: String(value),
					})),
				);
			}
			if (cm.binaryData) {
				setBinaryDataVars(
					Object.entries(cm.binaryData).map(([name, value]) => ({
						name,
						value: String(value),
					})),
				);
			}
			if (cm.labels) {
				try {
					const parsed = JSON.parse(cm.labels);
					setLabels(
						Object.entries(parsed).map(([name, value]) => ({
							name,
							value: String(value),
						})),
					);
				} catch {
					setLabels([]);
				}
			}
		}
	}, [cm]);

	const deleteMutation = useMutation({
		mutationFn: async () => {
			const res = await api.api
				.configmaps({ clusterId })({ id: configmapId })
				.delete();
			if (res.error) {
				throw new Error(getEdenErrorMessage(res.error));
			}
			return res.data;
		},
		onSuccess: () => {
			toast.success("ConfigMap deleted successfully");
			queryClient.invalidateQueries({ queryKey: ["configmaps", clusterId] });
			navigate({
				to: `/dashboard/cluster/$id/configmaps`,
				params: { id: clusterId },
			});
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});

	if (isLoading)
		return <div className="p-6">Loading config map details...</div>;
	if (!cm) return <div className="p-6">ConfigMap not found</div>;

	return (
		<div className="flex flex-col h-screen bg-background">
			{/* Header Section */}
			<div className="border-b border-border bg-card">
				<div className="px-6 py-6 flex items-center justify-between">
					<div className="flex items-center gap-4 flex-1">
						<Link
							to={`/dashboard/cluster/$id/configmaps`}
							params={{ id: clusterId }}
						>
							<Button variant="ghost" size="icon" className="h-9 w-9">
								<ArrowLeft className="h-4 w-4" />
							</Button>
						</Link>
						<div className="flex-1 min-w-0">
							<h1 className="text-2xl font-bold tracking-tight truncate">
								{cm.name}
							</h1>
							<p className="text-sm text-muted-foreground">
								View and manage configuration data.
							</p>
						</div>
					</div>
					<div className="flex gap-2 ml-4 flex-shrink-0">
						{isEditing ? (
							<>
								<Button
									variant="outline"
									onClick={cancelEdit}
									disabled={updateMutation.isPending}
									size="sm"
								>
									<X className="h-4 w-4 mr-2" />
									Cancel
								</Button>
								<Button
									onClick={saveEdit}
									disabled={updateMutation.isPending}
									size="sm"
								>
									<Save className="h-4 w-4 mr-2" />
									{updateMutation.isPending ? "Saving..." : "Save"}
								</Button>
							</>
						) : (
							<Button variant="outline" onClick={startEdit} size="sm">
								<Edit2 className="h-4 w-4 mr-2" />
								Edit
							</Button>
						)}
						<Button
							variant="destructive"
							onClick={() => {
								if (
									confirm("Are you sure you want to delete this ConfigMap?")
								) {
									deleteMutation.mutate();
								}
							}}
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
					<TabsList className="grid w-full grid-cols-4 max-w-xl h-auto bg-transparent p-0 gap-0">
						<TabsTrigger
							value="overview"
							className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
						>
							Overview
						</TabsTrigger>
						<TabsTrigger
							value="data"
							className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
						>
							Data
						</TabsTrigger>
						<TabsTrigger
							value="binary"
							className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
						>
							Binary Data
						</TabsTrigger>
						<TabsTrigger
							value="labels"
							className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
						>
							Labels
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
							<p className="font-mono text-sm">{cm.name}</p>
						</div>
						<div className="space-y-2">
							<span className="text-xs font-semibold text-muted-foreground uppercase">
								Namespace
							</span>
							<p className="font-mono text-sm">{cm.namespace}</p>
						</div>
						<div className="space-y-2">
							<span className="text-xs font-semibold text-muted-foreground uppercase">
								UID
							</span>
							<p className="font-mono text-sm break-all">{cm.k8sUid}</p>
						</div>
						<div className="space-y-2">
							<span className="text-xs font-semibold text-muted-foreground uppercase">
								Updated At
							</span>
							<p className="font-mono text-sm">
								{new Date(cm.updatedAt).toLocaleString()}
							</p>
						</div>
					</div>
				</TabsContent>

				{/* Data Tab */}
				<TabsContent
					value="data"
					className="flex-1 overflow-auto p-6 space-y-6"
				>
					<div>
						<h3 className="text-sm font-semibold mb-4">ConfigMap Data</h3>
						<div className="space-y-4">
							{isEditing ? (
								<>
									{editDataVars.map((v, idx: number) => (
										<div
											key={`data-${v.name || idx}`}
											className="flex gap-2 items-start"
										>
											<Input
												placeholder="Key"
												value={v.name}
												onChange={(e) => {
													const newVars = [...editDataVars];
													newVars[idx].name = e.target.value;
													setEditDataVars(newVars);
												}}
												className="w-1/3"
											/>
											<Input
												placeholder="Value"
												value={v.value}
												onChange={(e) => {
													const newVars = [...editDataVars];
													newVars[idx].value = e.target.value;
													setEditDataVars(newVars);
												}}
												className="flex-1"
											/>
											<Button
												variant="ghost"
												size="icon"
												onClick={() => {
													const newVars = editDataVars.filter(
														(_, i) => i !== idx,
													);
													setEditDataVars(newVars);
												}}
											>
												<X className="h-4 w-4" />
											</Button>
										</div>
									))}
									<Button
										variant="outline"
										size="sm"
										onClick={() => {
											setEditDataVars([
												...editDataVars,
												{ name: "", value: "" },
											]);
										}}
									>
										Add Key-Value
									</Button>
								</>
							) : dataVars.length > 0 ? (
								dataVars.map((v: any) => (
									<div key={v.name} className="space-y-2">
										<div className="text-xs font-semibold text-muted-foreground">
											{v.name}
										</div>
										<pre className="p-3 bg-secondary rounded border overflow-x-auto whitespace-pre-wrap break-all text-xs font-mono">
											{v.value}
										</pre>
									</div>
								))
							) : (
								<p className="text-muted-foreground italic text-sm">
									No data values found.
								</p>
							)}
						</div>
					</div>
				</TabsContent>

				{/* Binary Data Tab */}
				<TabsContent
					value="binary"
					className="flex-1 overflow-auto p-6 space-y-6"
				>
					<div>
						<h3 className="text-sm font-semibold mb-4">Binary Data (Base64)</h3>
						<div className="space-y-4">
							{isEditing ? (
								<>
									{editBinaryDataVars.map((v, idx: number) => (
										<div
											key={`bin-${v.name || idx}`}
											className="flex gap-2 items-start"
										>
											<Input
												placeholder="Key"
												value={v.name}
												onChange={(e) => {
													const newVars = [...editBinaryDataVars];
													newVars[idx].name = e.target.value;
													setEditBinaryDataVars(newVars);
												}}
												className="w-1/3"
											/>
											<Input
												placeholder="Value (Base64)"
												value={v.value}
												onChange={(e) => {
													const newVars = [...editBinaryDataVars];
													newVars[idx].value = e.target.value;
													setEditBinaryDataVars(newVars);
												}}
												className="flex-1"
											/>
											<Button
												variant="ghost"
												size="icon"
												onClick={() => {
													const newVars = editBinaryDataVars.filter(
														(_, i) => i !== idx,
													);
													setEditBinaryDataVars(newVars);
												}}
											>
												<X className="h-4 w-4" />
											</Button>
										</div>
									))}
									<Button
										variant="outline"
										size="sm"
										onClick={() => {
											setEditBinaryDataVars([
												...editBinaryDataVars,
												{ name: "", value: "" },
											]);
										}}
									>
										Add Binary Key
									</Button>
								</>
							) : binaryDataVars.length > 0 ? (
								binaryDataVars.map((v: any) => (
									<div key={v.name} className="space-y-2">
										<div className="text-xs font-semibold text-muted-foreground">
											{v.name}
										</div>
										<pre className="p-3 bg-secondary rounded border overflow-x-auto whitespace-pre-wrap break-all text-xs font-mono">
											{v.value}
										</pre>
									</div>
								))
							) : (
								<p className="text-muted-foreground italic text-sm">
									No binary values found.
								</p>
							)}
						</div>
					</div>
				</TabsContent>

				{/* Labels Tab */}
				<TabsContent
					value="labels"
					className="flex-1 overflow-auto p-6 space-y-6"
				>
					<div>
						<h3 className="text-sm font-semibold mb-4">Labels</h3>
						<div className="space-y-2">
							{isEditing ? (
								<>
									{editLabels.map((l, idx: number) => (
										<div
											key={`label-${l.name || idx}`}
											className="flex gap-2 items-start"
										>
											<Input
												placeholder="Key"
												value={l.name}
												onChange={(e) => {
													const newLabels = [...editLabels];
													newLabels[idx].name = e.target.value;
													setEditLabels(newLabels);
												}}
												className="w-1/3"
											/>
											<Input
												placeholder="Value"
												value={l.value}
												onChange={(e) => {
													const newLabels = [...editLabels];
													newLabels[idx].value = e.target.value;
													setEditLabels(newLabels);
												}}
												className="flex-1"
											/>
											<Button
												variant="ghost"
												size="icon"
												onClick={() => {
													const newLabels = editLabels.filter(
														(_, i) => i !== idx,
													);
													setEditLabels(newLabels);
												}}
											>
												<X className="h-4 w-4" />
											</Button>
										</div>
									))}
									<Button
										variant="outline"
										size="sm"
										onClick={() => {
											setEditLabels([...editLabels, { name: "", value: "" }]);
										}}
									>
										Add Label
									</Button>
								</>
							) : labels.length > 0 ? (
								<div className="flex flex-wrap gap-2">
									{labels.map((l: any) => (
										<div
											key={l.name}
											className="flex gap-2 items-center px-3 py-1 bg-secondary rounded border"
										>
											<span className="font-semibold text-xs">{l.name}</span>
											<span className="text-xs text-muted-foreground">
												{l.value}
											</span>
										</div>
									))}
								</div>
							) : (
								<p className="text-muted-foreground italic text-sm">
									No labels found.
								</p>
							)}
						</div>
					</div>
				</TabsContent>
			</Tabs>
		</div>
	);
}
