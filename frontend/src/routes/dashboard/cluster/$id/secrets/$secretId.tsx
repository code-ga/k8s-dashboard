import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	useNavigate,
	useParams,
} from "@tanstack/react-router";
import {
	ArrowLeft,
	Edit2,
	Eye,
	EyeOff,
	Lock,
	Save,
	Trash2,
	X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { EnvVar } from "@/components/shared/env-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, getEdenErrorMessage } from "@/lib/api";

export const Route = createFileRoute(
	"/dashboard/cluster/$id/secrets/$secretId",
)({
	component: ManageSecretPage,
});

function ManageSecretPage() {
	const { id: clusterId, secretId } = useParams({
		from: "/dashboard/cluster/$id/secrets/$secretId",
	});
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [activeTab, setActiveTab] = useState("overview");
	const [revealAll, setRevealAll] = useState(false);
	const [isEditing, setIsEditing] = useState(false);
	const [editDataVars, setEditDataVars] = useState<EnvVar[]>([]);
	const [editLabels, setEditLabels] = useState<EnvVar[]>([]);

	const { data: secret, isLoading } = useQuery({
		queryKey: ["secret", clusterId, secretId],
		queryFn: async () => {
			const res = await api.api.secrets({ clusterId })({ id: secretId }).get();
			if (res.error) throw res.error;
			if (!res.data.data)
				throw new Error(res.data.message || "Failed to fetch secret");
			return res.data.data;
		},
	});

	const [dataVars, setDataVars] = useState<EnvVar[]>([]);
	const [labels, setLabels] = useState<EnvVar[]>([]);

	const startEdit = () => {
		setEditDataVars([...dataVars]);
		setEditLabels([...labels]);
		setIsEditing(true);
	};

	const cancelEdit = () => {
		setIsEditing(false);
		setEditDataVars([]);
		setEditLabels([]);
	};

	const saveEdit = () => {
		updateMutation.mutate();
	};

	const updateMutation = useMutation({
		mutationFn: async () => {
			const data: Record<string, string | null> = {};
			// Only send changed or new secret data
			editDataVars.forEach((v) => {
				const original = dataVars.find((ov) => ov.name === v.name);
				if (!original || original.value !== v.value) {
					data[v.name] = v.value || "";
				}
			});
			// Send null for deleted keys
			dataVars.forEach((ov) => {
				if (!editDataVars.find((v) => v.name === ov.name)) {
					data[ov.name] = null;
				}
			});

			const labelData: Record<string, string | null> = {};
			// Only send changed or new labels
			editLabels.forEach((l) => {
				const original = labels.find((ol) => ol.name === l.name);
				if (!original || original.value !== l.value) {
					labelData[l.name] = l.value || "";
				}
			});
			// Send null for deleted labels
			labels.forEach((ol) => {
				if (!editLabels.find((l) => l.name === ol.name)) {
					labelData[ol.name] = null;
				}
			});

			const res = await api.api.secrets({ clusterId })({ id: secretId }).put({
				data: Object.keys(data).length > 0 ? (data as any) : undefined,
				labels: Object.keys(labelData).length > 0 ? (labelData as any) : undefined,
			});
			if (res.error) {
				throw new Error(getEdenErrorMessage(res.error));
			}
			return res.data;
		},
		onSuccess: () => {
			toast.success("Secret updated successfully");
			queryClient.invalidateQueries({
				queryKey: ["secret", clusterId, secretId],
			});
			setIsEditing(false);
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});

	useEffect(() => {
		if (secret) {
			if (secret.data) {
				// Secret data in DB is encrypted JSON of {key: base64val}
				// Detail API returns decrypted JSON.
				setDataVars(
					Object.entries(secret.data).map(([name, value]) => {
						let decoded = String(value);
						try {
							// Kubernetes secret values are base64 encoded
							decoded = atob(String(value));
						} catch {
							// Fallback to original if not valid base64
						}
						return {
							name,
							value: decoded,
						};
					}),
				);
			}
			if (secret.labels) {
				try {
					const parsed = JSON.parse(secret.labels);
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
	}, [secret]);

	const deleteMutation = useMutation({
		mutationFn: async () => {
			const res = await api.api
				.secrets({ clusterId })({ id: secretId })
				.delete();
			if (res.error) {
				throw new Error(getEdenErrorMessage(res.error));
			}
			return res.data;
		},
		onSuccess: () => {
			toast.success("Secret deleted successfully");
			queryClient.invalidateQueries({ queryKey: ["secrets", clusterId] });
			navigate({
				to: `/dashboard/cluster/$id/secrets`,
				params: { id: clusterId },
			});
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});

	if (isLoading) return <div className="p-6">Loading secret details...</div>;
	if (!secret) return <div className="p-6">Secret not found</div>;

	return (
		<div className="flex flex-col h-screen bg-background">
			{/* Header Section */}
			<div className="border-b border-border bg-card">
				<div className="px-6 py-6 flex items-center justify-between">
					<div className="flex items-center gap-4 flex-1">
						<Link
							to={`/dashboard/cluster/$id/secrets`}
							params={{ id: clusterId }}
						>
							<Button variant="ghost" size="icon" className="h-9 w-9">
								<ArrowLeft className="h-4 w-4" />
							</Button>
						</Link>
						<div className="flex-1 min-w-0">
							<h1 className="text-2xl font-bold tracking-tight flex items-center gap-2 truncate">
								<Lock className="h-5 w-5 text-yellow-500 flex-shrink-0" />
								<span className="truncate">{secret.name}</span>
							</h1>
							<p className="text-sm text-muted-foreground">
								View and manage security-sensitive configuration data.
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
								if (confirm("Are you sure you want to delete this Secret?")) {
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
					<TabsList className="grid w-full grid-cols-3 max-w-lg h-auto bg-transparent p-0 gap-0">
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
							Secret Data
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
							<p className="font-mono text-sm">{secret.name}</p>
						</div>
						<div className="space-y-2">
							<span className="text-xs font-semibold text-muted-foreground uppercase">
								Namespace
							</span>
							<p className="font-mono text-sm">{secret.namespace}</p>
						</div>
						<div className="space-y-2">
							<span className="text-xs font-semibold text-muted-foreground uppercase">
								Type
							</span>
							<p className="font-mono text-sm">{secret.type || "Opaque"}</p>
						</div>
						<div className="space-y-2">
							<span className="text-xs font-semibold text-muted-foreground uppercase">
								UID
							</span>
							<p className="font-mono text-sm break-all">{secret.k8sUid}</p>
						</div>
						<div className="space-y-2">
							<span className="text-xs font-semibold text-muted-foreground uppercase">
								Updated At
							</span>
							<p className="font-mono text-sm">
								{new Date(secret.updatedAt).toLocaleString()}
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
						<div className="flex items-center justify-between mb-4">
							<h3 className="text-sm font-semibold">Decrypted Values</h3>
							{!isEditing && (
								<Button
									variant="ghost"
									size="sm"
									onClick={() => setRevealAll(!revealAll)}
								>
									{revealAll ? (
										<EyeOff className="h-4 w-4 mr-2" />
									) : (
										<Eye className="h-4 w-4 mr-2" />
									)}
									{revealAll ? "Hide Values" : "Reveal All"}
								</Button>
							)}
						</div>
						<div className="space-y-4">
							{isEditing ? (
								<>
									{editDataVars.map((v, idx: number) => (
										<div
											key={`edit-data-${v.name}`}
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
												placeholder="Value (plaintext)"
												value={v.value}
												onChange={(e) => {
													const newVars = [...editDataVars];
													newVars[idx].value = e.target.value;
													setEditDataVars(newVars);
												}}
												className="flex-1"
												type="text"
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
										Add Secret Key
									</Button>
								</>
							) : dataVars.length > 0 ? (
								dataVars.map((v: any) => (
									<SecretValueRow
										key={v.name}
										name={v.name}
										value={v.value}
										revealed={revealAll}
									/>
								))
							) : (
								<p className="text-muted-foreground italic text-sm">
									No data values found.
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
											key={`edit-label-${l.name}`}
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

function SecretValueRow({
	name,
	value,
	revealed: initialRevealed,
}: {
	name: string;
	value: string;
	revealed: boolean;
}) {
	const [isRevealed, setIsRevealed] = useState(initialRevealed);

	useEffect(() => {
		setIsRevealed(initialRevealed);
	}, [initialRevealed]);

	const decodedValue = value;

	return (
		<div className="space-y-1 group">
			<div className="flex items-center justify-between">
				<div className="text-xs font-semibold text-muted-foreground">
					{name}
				</div>
				<Button
					variant="ghost"
					size="icon"
					className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
					onClick={() => setIsRevealed(!isRevealed)}
				>
					{isRevealed ? (
						<EyeOff className="h-3 w-3" />
					) : (
						<Eye className="h-3 w-3" />
					)}
				</Button>
			</div>
			<pre className="p-3 bg-secondary rounded border overflow-x-auto whitespace-pre-wrap break-all text-xs font-mono">
				{isRevealed ? decodedValue : "••••••••••••••••"}
			</pre>
		</div>
	);
}
