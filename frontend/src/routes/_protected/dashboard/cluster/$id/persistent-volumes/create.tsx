import {
	createFileRoute,
	Link,
	useNavigate,
	useParams,
} from "@tanstack/react-router";
import { ArrowLeft, HardDrive, Loader2, Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import { replaceEmptyStringsWithUndefined } from "@/lib/utils";

const ACCESS_MODES = [
	{ value: "ReadWriteOnce", label: "ReadWriteOnce (RWO)" },
	{ value: "ReadOnlyMany", label: "ReadOnlyMany (ROX)" },
	{ value: "ReadWriteMany", label: "ReadWriteMany (RWX)" },
];

export const Route = createFileRoute(
	"/_protected/dashboard/cluster/$id/persistent-volumes/create",
)({
	component: CreatePersistentVolume,
});

function CreatePersistentVolume() {
	const { id } = useParams({
		from: "/_protected/dashboard/cluster/$id/persistent-volumes/create",
	});
	const navigate = useNavigate();
	const [loading, setLoading] = useState(false);

	const [formData, setFormData] = useState({
		name: "",
		capacity: 10240, // 10GiB in MiB
		storageClass: "",
		accessModes: ["ReadWriteOnce"] as string[],
		reclaimPolicy: "Delete",
		sourceType: "nfs" as "nfs" | "hostPath",
		nfsServer: "",
		nfsPath: "",
		nfsReadOnly: false,
		hostPath: "",
		hostPathType: "Directory",
	});

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!formData.name.trim()) {
			toast.error("Name is required");
			return
		}
		if (formData.capacity < 1) {
			toast.error("Capacity must be at least 1 MiB");
			return
		}
		if (formData.sourceType === "nfs") {
			if (!formData.nfsServer.trim() || !formData.nfsPath.trim()) {
				toast.error("NFS Server and Export Path are required");
				return
			}
		} else if (formData.sourceType === "hostPath") {
			if (!formData.hostPath.trim()) {
				toast.error("HostPath is required");
				return
			}
		}

		setLoading(true);

		try {
			const payload: any = {
				name: formData.name,
				capacity: `${Math.floor(formData.capacity / 1024)}Gi`,
				storageClass: formData.storageClass || undefined,
				accessModes: formData.accessModes,
				reclaimPolicy: formData.reclaimPolicy,
			}

			if (formData.sourceType === "nfs") {
				payload.nfs = {
					server: formData.nfsServer,
					path: formData.nfsPath,
					readOnly: formData.nfsReadOnly,
				}
			} else {
				payload.hostPath = {
					path: formData.hostPath,
					type: formData.hostPathType,
				}
			}

			const res = await api.api.pvs({ clusterId: id }).post(replaceEmptyStringsWithUndefined(payload));

			if (res.error) {
				toast.error(
					res.error.value?.message || "Failed to create PersistentVolume",
				)
			} else {
				toast.success("PersistentVolume creation initiated successfully");
				navigate({
					to: "/dashboard/cluster/$id/persistent-volumes",
					params: { id },
				})
			}
		} catch (error: any) {
			toast.error(error?.message || "Invalid input format");
		} finally {
			setLoading(false);
		}
	}

	const toggleAccessMode = (mode: string) => {
		setFormData((prev) => ({
			...prev,
			accessModes: prev.accessModes.includes(mode)
				? prev.accessModes.filter((m) => m !== mode)
				: [...prev.accessModes, mode],
		}))
	}

	return (
		<div className="max-w-3xl mx-auto space-y-6 py-6">
			<div className="flex items-center gap-4">
				<Link to="/dashboard/cluster/$id/persistent-volumes" params={{ id }}>
					<Button variant="ghost" size="icon">
						<ArrowLeft className="h-4 w-4" />
					</Button>
				</Link>
				<div>
					<h2 className="text-2xl font-bold tracking-tight">
						Create PersistentVolume
					</h2>
					<p className="text-muted-foreground">
						Provision cluster-wide storage resources
					</p>
				</div>
			</div>

			<form onSubmit={handleSubmit}>
				<Card className="border-none shadow-lg bg-card/50 backdrop-blur-sm">
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-purple-600">
							<HardDrive className="h-5 w-5" />
							PersistentVolume Configuration
						</CardTitle>
						<CardDescription>
							Define a cluster-wide storage resource. Note: PVs are
							cluster-scoped resources.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-6">
						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label htmlFor="name">Name</Label>
								<Input
									id="name"
									placeholder="my-persistent-volume"
									required
									value={formData.name}
									onChange={(e) =>
										setFormData({ ...formData, name: e.target.value })
									}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="capacity">Capacity (GiB)</Label>
								<Input
									id="capacity"
									type="number"
									min={1}
									required
									value={Math.floor(formData.capacity / 1024)}
									onChange={(e) =>
										setFormData({
											...formData,
											capacity: parseInt(e.target.value) * 1024,
										})
									}
								/>
								<p className="text-[10px] text-muted-foreground">
									{formData.capacity} MiB
								</p>
							</div>
						</div>

						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label htmlFor="storageClass">StorageClass (Optional)</Label>
								<Input
									id="storageClass"
									placeholder="local-path, nfs-client, etc."
									value={formData.storageClass}
									onChange={(e) =>
										setFormData({ ...formData, storageClass: e.target.value })
									}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="reclaimPolicy">Reclaim Policy</Label>
								<Select
									value={formData.reclaimPolicy}
									onValueChange={(value) =>
										setFormData({ ...formData, reclaimPolicy: value })
									}
								>
									<SelectTrigger id="reclaimPolicy">
										<SelectValue placeholder="Select policy" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="Delete">Delete</SelectItem>
										<SelectItem value="Retain">Retain</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</div>

						<div className="space-y-2">
							<Label>Access Modes</Label>
							<div className="flex gap-2">
								{ACCESS_MODES.map((mode) => (
									<Button
										key={mode.value}
										type="button"
										variant={
											formData.accessModes.includes(mode.value)
												? "default"
												: "outline"
										}
										size="sm"
										onClick={() => toggleAccessMode(mode.value)}
										className={
											formData.accessModes.includes(mode.value)
												? "bg-purple-600"
												: ""
										}
									>
										{mode.label}
									</Button>
								))}
							</div>
						</div>

						<div className="space-y-3">
							<Label>Source Type</Label>
							<div className="flex gap-2">
								<Button
									type="button"
									variant={
										formData.sourceType === "nfs" ? "default" : "outline"
									}
									onClick={() =>
										setFormData({ ...formData, sourceType: "nfs" })
									}
									className={
										formData.sourceType === "nfs" ? "bg-purple-600" : ""
									}
								>
									NFS
								</Button>
								<Button
									type="button"
									variant={
										formData.sourceType === "hostPath" ? "default" : "outline"
									}
									onClick={() =>
										setFormData({ ...formData, sourceType: "hostPath" })
									}
									className={
										formData.sourceType === "hostPath" ? "bg-purple-600" : ""
									}
								>
									HostPath
								</Button>
							</div>
						</div>

						{formData.sourceType === "nfs" && (
							<div className="p-4 bg-muted/30 rounded-lg border border-border/50 space-y-4">
								<h4 className="font-semibold text-sm">NFS Configuration</h4>
								<div className="grid grid-cols-2 gap-4">
									<div className="space-y-2">
										<Label htmlFor="nfsServer">NFS Server</Label>
										<Input
											id="nfsServer"
											placeholder="nfs.example.com"
											required={formData.sourceType === "nfs"}
											value={formData.nfsServer}
											onChange={(e) =>
												setFormData({ ...formData, nfsServer: e.target.value })
											}
										/>
									</div>
									<div className="space-y-2">
										<Label htmlFor="nfsPath">Export Path</Label>
										<Input
											id="nfsPath"
											placeholder="/exports/data"
											required={formData.sourceType === "nfs"}
											value={formData.nfsPath}
											onChange={(e) =>
												setFormData({ ...formData, nfsPath: e.target.value })
											}
										/>
									</div>
								</div>
								<div className="flex items-center gap-2">
									<input
										id="nfsReadOnly"
										type="checkbox"
										checked={formData.nfsReadOnly}
										onChange={(e) =>
											setFormData({
												...formData,
												nfsReadOnly: e.target.checked,
											})
										}
										className="h-4 w-4"
									/>
									<Label htmlFor="nfsReadOnly" className="text-sm font-normal">
										Read Only
									</Label>
								</div>
							</div>
						)}

						{formData.sourceType === "hostPath" && (
							<div className="p-4 bg-muted/30 rounded-lg border border-border/50 space-y-4">
								<h4 className="font-semibold text-sm">
									HostPath Configuration
								</h4>
								<div className="grid grid-cols-2 gap-4">
									<div className="space-y-2">
										<Label htmlFor="hostPath">Path</Label>
										<Input
											id="hostPath"
											placeholder="/mnt/data"
											required={formData.sourceType === "hostPath"}
											value={formData.hostPath}
											onChange={(e) =>
												setFormData({ ...formData, hostPath: e.target.value })
											}
										/>
									</div>
									<div className="space-y-2">
										<Label htmlFor="hostPathType">Type</Label>
										<Select
											value={formData.hostPathType}
											onValueChange={(value) =>
												setFormData({ ...formData, hostPathType: value })
											}
										>
											<SelectTrigger id="hostPathType">
												<SelectValue placeholder="Select type" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="Directory">Directory</SelectItem>
												<SelectItem value="DirectoryOrCreate">
													DirectoryOrCreate
												</SelectItem>
												<SelectItem value="File">File</SelectItem>
												<SelectItem value="FileOrCreate">
													FileOrCreate
												</SelectItem>
											</SelectContent>
										</Select>
									</div>
								</div>
							</div>
						)}

						<div className="pt-4 flex justify-end">
							<Button
								type="submit"
								disabled={loading}
								className="w-full sm:w-auto bg-gradient-to-r from-purple-600 to-pink-600"
							>
								{loading ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Creating...
									</>
								) : (
									<>
										<Save className="mr-2 h-4 w-4" />
										Create PersistentVolume
									</>
								)}
							</Button>
						</div>
					</CardContent>
				</Card>
			</form>
		</div>
	)
}
