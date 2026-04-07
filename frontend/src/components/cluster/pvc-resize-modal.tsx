import { useState } from "react";
import { Loader2, Maximize2, Save, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface ResizePVCModalProps {
	isOpen: boolean;
	onClose: () => void;
	pvc: { id: number; name: string; capacity: number };
	clusterId: string;
	onSuccess: () => void;
}

export function ResizePVCModal({
	isOpen,
	onClose,
	pvc,
	clusterId,
	onSuccess,
}: ResizePVCModalProps) {
	const [newCapacity, setNewCapacity] = useState(pvc.capacity);
	const [loading, setLoading] = useState(false);

	const handleResize = async () => {
		if (newCapacity <= pvc.capacity) {
			toast.error("New capacity must be greater than current capacity.");
			return;
		}

		setLoading(true);
		try {
			const res = await api.api
				.pvcs({ clusterId })({ id: pvc.id.toString() })
				.patch({ capacity: newCapacity });

			if (res.error) {
				toast.error(res.error.value?.message || "Failed to resize PVC");
			} else {
				toast.success("PVC resizing initiated successfully");
				onSuccess();
				onClose();
			}
		} catch (error) {
			toast.error("An unexpected error occurred");
		} finally {
			setLoading(false);
		}
	};

	return (
		<Dialog open={isOpen} onOpenChange={onClose}>
			<DialogContent className="sm:max-w-[425px] border-none shadow-2xl">
				<DialogHeader>
					<div className="mx-auto w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
						<Maximize2 className="h-6 w-6 text-blue-600" />
					</div>
					<DialogTitle className="text-center text-xl font-bold">
						Resize Storage Claim
					</DialogTitle>
					<DialogDescription className="text-center">
						Expand the storage capacity for{" "}
						<span className="font-bold text-foreground">{pvc.name}</span>.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-4">
					<div className="bg-yellow-50 border border-yellow-100 rounded-lg p-3 flex gap-3 text-[11px] text-yellow-800">
						<AlertTriangle className="h-4 w-4 shrink-0 text-yellow-600" />
						<p>
							<span className="font-bold">Important:</span> In Kubernetes,
							storage volumes can only be{" "}
							<span className="font-bold underline">expanded</span>. Shriking is
							not supported.
						</p>
					</div>

					<div className="flex justify-between items-center px-2 py-2 bg-muted rounded-md border border-border/50">
						<div className="flex flex-col">
							<span className="text-[10px] font-bold uppercase text-muted-foreground">
								Original Capacity
							</span>
							<span className="text-sm font-semibold">{pvc.capacity} MiB</span>
						</div>
						<div className="h-8 w-[1px] bg-border" />
						<div className="flex flex-col text-right">
							<span className="text-[10px] font-bold uppercase text-blue-600">
								New Capacity
							</span>
							<span className="text-sm font-bold text-blue-600">
								{newCapacity} MiB
							</span>
						</div>
					</div>

					<div className="space-y-2">
						<Label htmlFor="capacity">Desired Capacity (MiB)</Label>
						<Input
							id="capacity"
							type="number"
							min={pvc.capacity + 1}
							value={newCapacity}
							onChange={(e) => setNewCapacity(parseInt(e.target.value))}
							className="border-blue-100 focus-visible:ring-blue-600"
						/>
						<p className="text-[10px] text-muted-foreground italic text-right font-medium">
							+ {(newCapacity - pvc.capacity).toFixed(0)} MiB increase
						</p>
					</div>
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={onClose} disabled={loading}>
						Cancel
					</Button>
					<Button
						onClick={handleResize}
						disabled={loading || newCapacity <= pvc.capacity}
						className="bg-blue-600 hover:bg-blue-700 shadow-md"
					>
						{loading ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								Resizing...
							</>
						) : (
							<>
								<Save className="mr-2 h-4 w-4" />
								Confirm Expansion
							</>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
