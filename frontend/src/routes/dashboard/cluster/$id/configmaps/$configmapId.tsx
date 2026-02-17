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
import { api } from "@/lib/api";

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
			return res.data.data as any;
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
				throw new Error(
					res.error.value?.message || "Failed to update config map",
				);
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
				throw new Error(
					res.error.value?.message || "Failed to delete config map",
				);
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

	if (isLoading) return <div>Loading config map details...</div>;
	if (!cm) return <div>ConfigMap not found</div>;

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-4">
					<Link
						to={`/dashboard/cluster/$id/configmaps`}
						params={{ id: clusterId }}
					>
						<Button variant="ghost" size="icon">
							<ArrowLeft className="h-4 w-4" />
						</Button>
					</Link>
					<div>
						<h2 className="text-3xl font-bold tracking-tight">
							ConfigMap: {cm.name}
						</h2>
						<p className="text-muted-foreground">
							View and manage configuration data.
						</p>
					</div>
				</div>
				<div className="flex gap-2">
					{isEditing ? (
						<>
							<Button
								variant="outline"
								onClick={cancelEdit}
								disabled={updateMutation.isPending}
							>
								<X className="h-4 w-4 mr-2" />
								Cancel
							</Button>
							<Button onClick={saveEdit} disabled={updateMutation.isPending}>
								<Save className="h-4 w-4 mr-2" />
								{updateMutation.isPending ? "Saving..." : "Save Changes"}
							</Button>
						</>
					) : (
						<Button variant="outline" onClick={startEdit}>
							<Edit2 className="h-4 w-4 mr-2" />
							Edit ConfigMap
						</Button>
					)}
					<Button
						variant="destructive"
						onClick={() => {
							if (confirm("Are you sure you want to delete this ConfigMap?")) {
								deleteMutation.mutate();
							}
						}}
						disabled={deleteMutation.isPending}
					>
						<Trash2 className="h-4 w-4 mr-2" />
						{deleteMutation.isPending ? "Deleting..." : "Delete ConfigMap"}
					</Button>
				</div>
			</div>

			<Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
				<TabsList className="grid w-full grid-cols-4 max-w-2xl">
					<TabsTrigger value="overview">Overview</TabsTrigger>
					<TabsTrigger value="data">Data</TabsTrigger>
					<TabsTrigger value="binary">Binary Data</TabsTrigger>
					<TabsTrigger value="labels">Labels</TabsTrigger>
				</TabsList>

				<TabsContent value="overview" className="pt-4 space-y-4">
					<div className="grid grid-cols-2 gap-4 p-6 bg-muted rounded-lg border">
						<div>
							<div className="text-sm font-medium text-muted-foreground">
								Name
							</div>
							<p className="font-mono text-lg">{cm.name}</p>
						</div>
						<div>
							<div className="text-sm font-medium text-muted-foreground">
								Namespace
							</div>
							<p className="font-mono text-lg">{cm.namespace}</p>
						</div>
						<div>
							<div className="text-sm font-medium text-muted-foreground">
								UID
							</div>
							<p className="font-mono text-sm break-all">{cm.k8sUid}</p>
						</div>
						<div>
							<div className="text-sm font-medium text-muted-foreground">
								Updated At
							</div>
							<p className="font-mono text-lg">
								{new Date(cm.updatedAt).toLocaleString()}
							</p>
						</div>
					</div>
				</TabsContent>

				<TabsContent value="data" className="pt-4 space-y-4">
					<div className="bg-muted p-4 rounded-lg border">
						<h3 className="text-lg font-medium mb-4">ConfigMap Data</h3>
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
									<div key={v.name} className="space-y-1">
										<div className="text-sm font-bold text-muted-foreground">
											{v.name}
										</div>
										<pre className="p-3 bg-secondary rounded border overflow-x-auto whitespace-pre-wrap break-all text-xs">
											{v.value}
										</pre>
									</div>
								))
							) : (
								<p className="text-muted-foreground italic">
									No data values found.
								</p>
							)}
						</div>
					</div>
				</TabsContent>

				<TabsContent value="binary" className="pt-4 space-y-4">
					<div className="bg-muted p-4 rounded-lg border">
						<h3 className="text-lg font-medium mb-4">Binary Data (Base64)</h3>
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
									<div key={v.name} className="space-y-1">
										<div className="text-sm font-bold text-muted-foreground">
											{v.name}
										</div>
										<pre className="p-3 bg-secondary rounded border overflow-x-auto whitespace-pre-wrap break-all text-xs">
											{v.value}
										</pre>
									</div>
								))
							) : (
								<p className="text-muted-foreground italic">
									No binary values found.
								</p>
							)}
						</div>
					</div>
				</TabsContent>

				<TabsContent value="labels" className="pt-4 space-y-4">
					<div className="bg-muted p-4 rounded-lg border">
						<h3 className="text-lg font-medium mb-4">Labels</h3>
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
								labels.map((l: any) => (
									<div key={l.name} className="flex gap-2">
										<span className="font-bold text-xs bg-secondary px-2 py-1 rounded">
											{l.name}
										</span>
										<span className="text-xs py-1">{l.value}</span>
									</div>
								))
							) : (
								<p className="text-muted-foreground italic">No labels found.</p>
							)}
						</div>
					</div>
				</TabsContent>
			</Tabs>
		</div>
	);
}
