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
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";

const PROVISIONERS = [
	{ value: "kubernetes.io/aws-ebs", label: "AWS EBS (kubernetes.io/aws-ebs)" },
	{
		value: "kubernetes.io/gce-pd",
		label: "Google Cloud PD (kubernetes.io/gce-pd)",
	},
	{
		value: "kubernetes.io/azure-disk",
		label: "Azure Disk (kubernetes.io/azure-disk)",
	},
	{ value: "nfs-client", label: "NFS Client (nfs-client)" },
	{ value: "local-path", label: "Local Path (local-path)" },
	{
		value: "rancher.io/local-path",
		label: "Rancher Local Path (rancher.io/local-path)",
	},
	{ value: "cephfs.csi.ceph.com", label: "Ceph CSI (cephfs.csi.ceph.com)" },
	{ value: "rbd.csi.ceph.com", label: "Ceph RBD CSI (rbd.csi.ceph.com)" },
];

export const Route = createFileRoute(
	"/dashboard/cluster/$id/storage-classes/create",
)({
	component: CreateStorageClass,
});

function CreateStorageClass() {
	const { id } = useParams({
		from: "/dashboard/cluster/$id/storage-classes/create",
	});
	const navigate = useNavigate();
	const [loading, setLoading] = useState(false);

	const [formData, setFormData] = useState({
		name: "",
		provisioner: "",
		reclaimPolicy: "Delete",
		volumeBindingMode: "Immediate",
		allowVolumeExpansion: false,
		annotations: "",
		labels: "",
	});

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);

		try {
			const payload = {
				name: formData.name,
				provisioner: formData.provisioner,
				reclaimPolicy: formData.reclaimPolicy,
				volumeBindingMode: formData.volumeBindingMode,
				allowVolumeExpansion: formData.allowVolumeExpansion,
				annotations: formData.annotations
					? JSON.parse(formData.annotations)
					: {},
				labels: formData.labels ? JSON.parse(formData.labels) : {},
			};

			const res = await api.api.storageclasses({ clusterId: id }).post(payload);

			if (res.error) {
				toast.error(
					(res.error.value as any)?.message || "Failed to create StorageClass",
				);
			} else {
				toast.success("StorageClass creation initiated successfully");
				navigate({
					to: "/dashboard/cluster/$id/storage-classes",
					params: { id },
				});
			}
		} catch (error: any) {
			toast.error(
				error?.message || "Invalid JSON format in annotations/labels",
			);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="max-w-2xl mx-auto space-y-6 py-6">
			<div className="flex items-center gap-4">
				<Link to="/dashboard/cluster/$id/storage-classes" params={{ id }}>
					<Button variant="ghost" size="icon">
						<ArrowLeft className="h-4 w-4" />
					</Button>
				</Link>
				<div>
					<h2 className="text-2xl font-bold tracking-tight">
						Create StorageClass
					</h2>
					<p className="text-muted-foreground">
						Define a storage provisioner for your cluster
					</p>
				</div>
			</div>

			<form onSubmit={handleSubmit}>
				<Card className="border-none shadow-lg bg-card/50 backdrop-blur-sm">
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-amber-600">
							<HardDrive className="h-5 w-5" />
							StorageClass Configuration
						</CardTitle>
						<CardDescription>
							Configure how dynamic volumes should be provisioned.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label htmlFor="name">Name</Label>
								<Input
									id="name"
									placeholder="my-storage-class"
									required
									value={formData.name}
									onChange={(e) =>
										setFormData({ ...formData, name: e.target.value })
									}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="provisioner">Provisioner</Label>
								<Select
									value={formData.provisioner}
									onValueChange={(value) =>
										setFormData({ ...formData, provisioner: value })
									}
								>
									<SelectTrigger id="provisioner">
										<SelectValue placeholder="Select provisioner" />
									</SelectTrigger>
									<SelectContent>
										{PROVISIONERS.map((p) => (
											<SelectItem key={p.value} value={p.value}>
												{p.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</div>

						<div className="grid grid-cols-2 gap-4">
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
							<div className="space-y-2">
								<Label htmlFor="volumeBindingMode">Volume Binding Mode</Label>
								<Select
									value={formData.volumeBindingMode}
									onValueChange={(value) =>
										setFormData({ ...formData, volumeBindingMode: value })
									}
								>
									<SelectTrigger id="volumeBindingMode">
										<SelectValue placeholder="Select mode" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="Immediate">Immediate</SelectItem>
										<SelectItem value="WaitForFirstConsumer">
											WaitForFirstConsumer
										</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</div>

						<div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border border-border/50">
							<div className="space-y-0.5">
								<Label htmlFor="allowVolumeExpansion">
									Allow Volume Expansion
								</Label>
								<p className="text-[10px] text-muted-foreground">
									Enable PVCs using this StorageClass to be resized
								</p>
							</div>
							<Switch
								id="allowVolumeExpansion"
								checked={formData.allowVolumeExpansion}
								onCheckedChange={(checked) =>
									setFormData({ ...formData, allowVolumeExpansion: checked })
								}
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="annotations">Annotations (JSON)</Label>
							<Input
								id="annotations"
								placeholder='{"key": "value"}'
								value={formData.annotations}
								onChange={(e) =>
									setFormData({ ...formData, annotations: e.target.value })
								}
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="labels">Labels (JSON)</Label>
							<Input
								id="labels"
								placeholder='{"key": "value"}'
								value={formData.labels}
								onChange={(e) =>
									setFormData({ ...formData, labels: e.target.value })
								}
							/>
						</div>

						<div className="pt-4 flex justify-end">
							<Button
								type="submit"
								disabled={loading}
								className="w-full sm:w-auto bg-gradient-to-r from-amber-600 to-orange-600"
							>
								{loading ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Creating...
									</>
								) : (
									<>
										<Save className="mr-2 h-4 w-4" />
										Create StorageClass
									</>
								)}
							</Button>
						</div>
					</CardContent>
				</Card>
			</form>
		</div>
	);
}
