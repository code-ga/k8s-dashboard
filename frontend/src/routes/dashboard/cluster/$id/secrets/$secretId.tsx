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
import { api } from "@/lib/api";

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
			const data: Record<string, string> = {};
			editDataVars.forEach((v) => {
				if (v.name && v.value) {
					// Encode value to base64 for Kubernetes secret
					data[v.name] = btoa(v.value);
				}
			});

			const labelData: Record<string, string> = {};
			editLabels.forEach((v) => {
				if (v.name && v.value) labelData[v.name] = v.value;
			});

			const res = await api.api.secrets({ clusterId })({ id: secretId }).put({
				data,
				labels: labelData,
			});
			if (res.error) {
				throw new Error(res.error.value?.message || "Failed to update secret");
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
					Object.entries(secret.data).map(([name, value]) => ({
						name,
						value: String(value),
					})),
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
				throw new Error(res.error.value?.message || "Failed to delete secret");
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

	if (isLoading) return <div>Loading secret details...</div>;
	if (!secret) return <div>Secret not found</div>;

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-4">
					<Link
						to={`/dashboard/cluster/$id/secrets`}
						params={{ id: clusterId }}
					>
						<Button variant="ghost" size="icon">
							<ArrowLeft className="h-4 w-4" />
						</Button>
					</Link>
					<div>
						<h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
							<Lock className="h-6 w-6 text-yellow-500" />
							Secret: {secret.name}
						</h2>
						<p className="text-muted-foreground">
							View security-sensitive configuration data.
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
							Edit Secret
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
					>
						<Trash2 className="h-4 w-4 mr-2" />
						{deleteMutation.isPending ? "Deleting..." : "Delete Secret"}
					</Button>
				</div>
			</div>

			<Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
				<TabsList className="grid w-full grid-cols-3 max-w-xl">
					<TabsTrigger value="overview">Overview</TabsTrigger>
					<TabsTrigger value="data">Secret Data</TabsTrigger>
					<TabsTrigger value="labels">Labels</TabsTrigger>
				</TabsList>

				<TabsContent value="overview" className="pt-4 space-y-4">
					<div className="grid grid-cols-2 gap-4 p-6 bg-muted rounded-lg border">
						<div>
							<div className="text-sm font-medium text-muted-foreground">
								Name
							</div>
							<p className="font-mono text-lg">{secret.name}</p>
						</div>
						<div>
							<div className="text-sm font-medium text-muted-foreground">
								Namespace
							</div>
							<p className="font-mono text-lg">{secret.namespace}</p>
						</div>
						<div>
							<div className="text-sm font-medium text-muted-foreground">
								Type
							</div>
							<p className="font-mono text-lg">{secret.type || "Opaque"}</p>
						</div>
						<div>
							<div className="text-sm font-medium text-muted-foreground">
								UID
							</div>
							<p className="font-mono text-sm break-all">{secret.k8sUid}</p>
						</div>
						<div>
							<div className="text-sm font-medium text-muted-foreground">
								Updated At
							</div>
							<p className="font-mono text-lg">
								{new Date(secret.updatedAt).toLocaleString()}
							</p>
						</div>
					</div>
				</TabsContent>

				<TabsContent value="data" className="pt-4 space-y-4">
					<div className="bg-muted p-4 rounded-lg border">
						<div className="flex items-center justify-between mb-4">
							<h3 className="text-lg font-medium">Decrypted Values</h3>
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
								<p className="text-muted-foreground italic">
									No data values found.
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

	// Value is Base64 in secret data, we should decode it if it's not Opaque or just handle it.
	// Actually K8s secret data values are ALWAYS base64.
	const decodedValue = (() => {
		try {
			return atob(value);
		} catch {
			return value;
		}
	})();

	return (
		<div className="space-y-1 group">
			<div className="flex items-center justify-between">
				<div className="text-sm font-bold text-muted-foreground">{name}</div>
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
				{isRevealed ? decodedValue : "********************************"}
			</pre>
		</div>
	);
}
