import { useState } from "react";
import {
	createFileRoute,
	Link,
	useNavigate,
	useParams,
} from "@tanstack/react-router";
import { ArrowLeft, Database, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { replaceEmptyStringsWithUndefined } from "@/lib/utils";

export const Route = createFileRoute(
	"/_protected/dashboard/cluster/$id/pvcs/create",
)({
	component: CreatePVC,
});

function CreatePVC() {
	const { id } = useParams({
		from: "/_protected/dashboard/cluster/$id/pvcs/create",
	});
	const navigate = useNavigate();
	const [loading, setLoading] = useState(false);

	const [formData, setFormData] = useState({
		name: "",
		namespace: "default",
		storageClass: "",
		capacity: 1024, // 1GiB in MiB
		accessModes: ["ReadWriteOnce"],
	});

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!formData.name.trim()) {
			toast.error("Name is required");
			return;
		}
		if (!formData.namespace.trim()) {
			toast.error("Namespace is required");
			return;
		}
		if (formData.capacity < 1) {
			toast.error("Capacity must be at least 1 MiB");
			return;
		}

		setLoading(true);

		try {
			const res = await api.api
				.pvcs({ clusterId: id })
				.post(replaceEmptyStringsWithUndefined(formData));

			if (res.error) {
				toast.error(res.error.value?.message || "Failed to create PVC");
			} else {
				toast.success("PVC creation initiated successfully");
				navigate({ to: "/dashboard/cluster/$id/pvcs", params: { id } });
			}
		} catch (error) {
			toast.error("An unexpected error occurred");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="max-w-2xl mx-auto space-y-6 py-6">
			<div className="flex items-center gap-4">
				<Link to="/dashboard/cluster/$id/pvcs" params={{ id }}>
					<Button variant="ghost" size="icon">
						<ArrowLeft className="h-4 w-4" />
					</Button>
				</Link>
				<div>
					<h2 className="text-2xl font-bold tracking-tight">
						Create Persistent Volume Claim
					</h2>
					<p className="text-muted-foreground">
						Provision new storage for your applications
					</p>
				</div>
			</div>

			<form onSubmit={handleSubmit}>
				<Card className="border-none shadow-lg bg-card/50 backdrop-blur-sm">
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-blue-600">
							<Database className="h-5 w-5" />
							Storage Configuration
						</CardTitle>
						<CardDescription>
							Define the characteristics of the requested storage volume.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label htmlFor="name">Name</Label>
								<Input
									id="name"
									placeholder="my-data-pvc"
									required
									value={formData.name}
									onChange={(e) =>
										setFormData({ ...formData, name: e.target.value })
									}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="namespace">Namespace</Label>
								<Input
									id="namespace"
									placeholder="default"
									required
									value={formData.namespace}
									onChange={(e) =>
										setFormData({ ...formData, namespace: e.target.value })
									}
								/>
							</div>
						</div>

						<div className="space-y-2">
							<Label htmlFor="storageClass">Storage Class (Optional)</Label>
							<Input
								id="storageClass"
								placeholder="local-path, nfs, etc."
								value={formData.storageClass}
								onChange={(e) =>
									setFormData({ ...formData, storageClass: e.target.value })
								}
							/>
							<p className="text-[10px] text-muted-foreground italic">
								Leave empty to use the cluster's default storage class.
							</p>
						</div>

						<div className="space-y-2">
							<Label htmlFor="capacity">Capacity (MiB)</Label>
							<Input
								id="capacity"
								type="number"
								min={1}
								required
								value={formData.capacity}
								onChange={(e) =>
									setFormData({
										...formData,
										capacity: parseInt(e.target.value),
									})
								}
							/>
							<div className="flex justify-between text-[10px] font-medium text-muted-foreground mt-1">
								<span>1024 MiB = 1 GiB</span>
								<span className="text-blue-600">
									{(formData.capacity / 1024).toFixed(2)} GiB
								</span>
							</div>
						</div>

						<div className="pt-4 flex justify-end">
							<Button
								type="submit"
								disabled={loading}
								className="w-full sm:w-auto bg-gradient-to-r from-blue-600 to-indigo-600"
							>
								{loading ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Creating...
									</>
								) : (
									<>
										<Save className="mr-2 h-4 w-4" />
										Create Claim
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
