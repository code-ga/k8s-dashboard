import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bug } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
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

interface DebugPodModalProps {
	clusterId: string;
	podId: string;
	podName: string;
	containers: string[];
	onSuccess?: () => void;
}

export function DebugPodModal({
	clusterId,
	podId,
	podName,
	containers,
	onSuccess,
}: DebugPodModalProps) {
	const [open, setOpen] = useState(false);
	const [image, setImage] = useState("nicolaka/netshoot");
	const [name, setName] = useState("");
	const [targetContainer, setTargetContainer] = useState(containers[0] || "");
	const queryClient = useQueryClient();

	const mutation = useMutation({
		mutationFn: async () => {
			const res = await api.api
				.pods({ clusterId })({ id: podId })["ephemeral-containers"].post({
					image,
					name: name || undefined,
					targetContainer: targetContainer || undefined,
				});

			if (res.error) {
				throw new Error(res.error.value?.message || "Failed to create debug container");
			}

			return res.data;
		},
		onSuccess: () => {
			toast.success("Debug container injection initiated");
			queryClient.invalidateQueries({ queryKey: ["pod", clusterId, podId] });
			setOpen(false);
			onSuccess?.();
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm">
					<Bug className="mr-2 h-4 w-4" /> Debug
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[500px]">
				<DialogHeader>
					<DialogTitle>Inject Debug Container</DialogTitle>
					<DialogDescription>
						Launch an ephemeral container directly into <strong>{podName}</strong> to troubleshoot issues.
					</DialogDescription>
				</DialogHeader>
				
				<div className="space-y-4 py-4">
					<div className="space-y-2">
						<Label htmlFor="debug-image">Debug Image</Label>
						<Input
							id="debug-image"
							value={image}
							onChange={(e) => setImage(e.target.value)}
							placeholder="e.g. nicolaka/netshoot"
						/>
						<div className="flex gap-2 mt-1">
							<Button 
								variant="ghost" 
								size="icon-lg" 
								className="text-[10px] h-6"
								onClick={() => setImage("nicolaka/netshoot")}
							>
								netshoot
							</Button>
							<Button 
								variant="ghost" 
								size="icon-lg" 
								className="text-[10px] h-6"
								onClick={() => setImage("busybox")}
							>
								busybox
							</Button>
							<Button 
								variant="ghost" 
								size="icon-lg" 
								className="text-[10px] h-6"
								onClick={() => setImage("curlimages/curl")}
							>
								curl
							</Button>
						</div>
					</div>

					<div className="space-y-2">
						<Label htmlFor="target-container">Target Container (Namespace Sharing)</Label>
						<Select value={targetContainer} onValueChange={setTargetContainer}>
							<SelectTrigger id="target-container">
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
						<p className="text-[11px] text-muted-foreground italic">
							The debug container will share the process namespace of this container if supported.
						</p>
					</div>

					<div className="space-y-2">
						<Label htmlFor="debug-name">Container Name (Optional)</Label>
						<Input
							id="debug-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="debug-console"
						/>
					</div>
				</div>

				<DialogFooter>
					<Button 
						onClick={() => mutation.mutate()} 
						disabled={mutation.isPending}
					>
						{mutation.isPending ? "Injecting..." : "Inject Container"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
