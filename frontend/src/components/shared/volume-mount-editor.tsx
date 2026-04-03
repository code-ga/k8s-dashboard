import { useQuery } from "@tanstack/react-query";
import {
	Database,
	FolderPlus,
	HardDrive,
	HelpCircle,
	Plus,
	Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
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
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";

export interface IPvcVolumeMount {
	name: string;
	pvcName: string;
	mountPath: string;
	readOnly?: boolean;
	subPath?: string;
}

export interface IEmptyDirVolumeMount {
	name: string;
	mountPath: string;
	medium?: string; // "" or "Memory"
	sizeLimit?: string; // e.g. "256Mi"
}

interface VolumeMountEditorProps {
	clusterId: string;
	pvcVolumes?: IPvcVolumeMount[];
	emptyDirVolumes?: IEmptyDirVolumeMount[];
	onChange?: (volumes: {
		pvcVolumes: IPvcVolumeMount[];
		emptyDirVolumes: IEmptyDirVolumeMount[];
	}) => void;
}

function VolumeHelpDialog() {
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="h-7 gap-1.5 text-muted-foreground hover:text-foreground"
				>
					<HelpCircle className="size-3.5" />
					<span className="text-xs">Volume Guide</span>
				</Button>
			</DialogTrigger>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<HardDrive className="size-4 text-primary" />
						Volume Mounts Guide
					</DialogTitle>
					<DialogDescription>
						Attach storage to your containers to persist data or share files.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 text-sm">
					<div className="space-y-2">
						<div className="flex items-center gap-2 font-semibold text-blue-600">
							<Database className="size-4" />
							Persistent Volume Claim (PVC)
						</div>
						<p className="text-xs text-muted-foreground leading-relaxed">
							Mount an existing PVC into your container. This provides persistent storage that survives pod restarts.
						</p>
						<ul className="list-disc list-inside text-xs text-muted-foreground space-y-1 ml-1">
							<li><b>Mount Path:</b> Where the volume appears inside the container</li>
							<li><b>Sub Path:</b> Map a specific directory inside the PVC</li>
							<li><b>Read Only:</b> Prevent the container from writing to the volume</li>
						</ul>
					</div>

					<Separator />

					<div className="space-y-2">
						<div className="flex items-center gap-2 font-semibold text-emerald-600">
							<FolderPlus className="size-4" />
							EmptyDir (Temporary)
						</div>
						<p className="text-xs text-muted-foreground leading-relaxed">
							Creates a temporary directory that exists as long as the pod is running. Useful for scratch space or shared cache between containers.
						</p>
						<ul className="list-disc list-inside text-xs text-muted-foreground space-y-1 ml-1">
							<li><b>Medium:</b> Use "Memory" for a RAM-backed temporary file system (tmpfs)</li>
							<li><b>Size Limit:</b> Maximum capacity (e.g., 512Mi, 1Gi)</li>
						</ul>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}

function VolumeEmptyState({ label }: { label: string }) {
	return (
		<p className="text-xs text-muted-foreground italic py-1">
			No {label} mounts added yet.
		</p>
	);
}

export default function VolumeMountEditor({
	clusterId,
	pvcVolumes = [],
	emptyDirVolumes = [],
	onChange,
}: VolumeMountEditorProps) {
	const { data: pvcs } = useQuery({
		queryKey: ["pvcs", clusterId, "volume-mount-editor"],
		queryFn: async () => {
			const res = await api.api.pvcs({ clusterId: Number(clusterId) }).get();
			if (res.error) throw res.error;
			return res.data.data;
		},
	});

	const [pvcList, setPvcList] = useState<IPvcVolumeMount[]>(pvcVolumes);
	const [emptyDirList, setEmptyDirList] = useState<IEmptyDirVolumeMount[]>(emptyDirVolumes);

	// PVC Form state
	const [pvcVolName, setPvcVolName] = useState("");
	const [pvcTargetName, setPvcTargetName] = useState("");
	const [pvcMountPath, setPvcMountPath] = useState("");
	const [pvcReadOnly, setPvcReadOnly] = useState(false);
	const [pvcSubPath, setPvcSubPath] = useState("");

	// EmptyDir Form state
	const [edVolName, setEdVolName] = useState("");
	const [edMountPath, setEdMountPath] = useState("");
	const [edMedium, setEdMedium] = useState("Default");
	const [edSizeLimit, setEdSizeLimit] = useState("");

	useEffect(() => {
		setPvcList(pvcVolumes);
		setEmptyDirList(emptyDirVolumes);
	}, [pvcVolumes, emptyDirVolumes]);

	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;
	const isMounted = useRef(false);

	useEffect(() => {
		if (!isMounted.current) {
			isMounted.current = true;
			return;
		}
		onChangeRef.current?.({
			pvcVolumes: pvcList,
			emptyDirVolumes: emptyDirList,
		});
	}, [pvcList, emptyDirList]);

	const pvcCount = pvcList.length;
	const edCount = emptyDirList.length;

	return (
		<div className="space-y-4">
			<div className="flex items-start justify-between gap-2">
				<div>
					<p className="text-xs text-muted-foreground">
						Configure storage volumes and temporary local directories.
					</p>
				</div>
				<VolumeHelpDialog />
			</div>

			<Tabs defaultValue="pvc" className="w-full">
				<TabsList className="grid w-full grid-cols-2 h-9">
					<TabsTrigger value="pvc" className="gap-1.5 text-xs">
						<Database className="size-3.5 text-blue-500" />
						PVC
						{pvcCount > 0 && (
							<Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
								{pvcCount}
							</Badge>
						)}
					</TabsTrigger>
					<TabsTrigger value="emptydir" className="gap-1.5 text-xs">
						<FolderPlus className="size-3.5 text-emerald-500" />
						EmptyDir
						{edCount > 0 && (
							<Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
								{edCount}
							</Badge>
						)}
					</TabsTrigger>
				</TabsList>

				<TabsContent value="pvc" className="space-y-4 mt-3">
					<Card>
						<CardHeader className="px-4 py-3">
							<CardTitle className="text-sm font-semibold">Mounted PVCs</CardTitle>
							<CardDescription className="text-xs">Existing storage claims attached to this pod.</CardDescription>
						</CardHeader>
						<CardContent className="px-4 pb-4 space-y-4">
							{pvcList.length > 0 ? (
								<div className="grid gap-2">
									{pvcList.map((vol) => (
										<div key={vol.name} className="flex items-center justify-between p-2 rounded-md border bg-muted/30">
											<div className="flex flex-col gap-0.5">
												<div className="flex items-center gap-2">
													<span className="font-mono text-xs font-semibold">{vol.name}</span>
													<Badge variant="outline" className="text-[10px] py-0 h-4">{vol.pvcName}</Badge>
													{vol.readOnly && <Badge variant="secondary" className="text-[10px] py-0 h-4">RO</Badge>}
												</div>
												<div className="text-[11px] text-muted-foreground font-mono">
													{vol.mountPath}{vol.subPath ? ` (subPath: ${vol.subPath})` : ""}
												</div>
											</div>
											<Button
												variant="ghost"
												size="sm"
												onClick={() => setPvcList(pvcList.filter((v) => v.name !== vol.name))}
												className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
											>
												<Trash2 className="size-3.5" />
											</Button>
										</div>
									))}
								</div>
							) : (
								<VolumeEmptyState label="PVC" />
							)}

							<Separator />

							<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
								<div className="space-y-1.5">
									<Label className="text-xs leading-none">Internal Volume Name</Label>
									<Input
										placeholder="data-vol"
										className="h-8 text-xs"
										value={pvcVolName}
										onChange={(e) => setPvcVolName(e.target.value)}
									/>
									<span className="text-[10px] text-muted-foreground leading-none">Unique name for this mount</span>
								</div>
								<div className="space-y-1.5">
									<Label className="text-xs leading-none">Select PVC</Label>
									<Select value={pvcTargetName} onValueChange={setPvcTargetName}>
										<SelectTrigger className="h-8 text-xs">
											<SelectValue placeholder="Choose PVC" />
										</SelectTrigger>
										<SelectContent>
											{pvcs?.map((pvc) => (
												<SelectItem key={pvc.id} value={pvc.name}>
													{pvc.name} ({pvc.capacity})
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								<div className="space-y-1.5">
									<Label className="text-xs leading-none">Mount Path</Label>
									<Input
										placeholder="/data"
										className="h-8 text-xs font-mono"
										value={pvcMountPath}
										onChange={(e) => setPvcMountPath(e.target.value)}
									/>
								</div>
								<div className="space-y-1.5">
									<Label className="text-xs leading-none">Sub Path (Optional)</Label>
									<Input
										placeholder="mysubdir"
										className="h-8 text-xs font-mono"
										value={pvcSubPath}
										onChange={(e) => setPvcSubPath(e.target.value)}
									/>
								</div>
								<div className="flex items-center gap-3 h-8">
									<Switch
										id="pvc-readonly"
										checked={pvcReadOnly}
										onCheckedChange={setPvcReadOnly}
									/>
									<Label htmlFor="pvc-readonly" className="text-xs cursor-pointer">Read Only</Label>
								</div>
								<div className="flex items-end">
									<Button
										className="h-8 w-full gap-1.5 text-xs"
										disabled={!pvcVolName || !pvcTargetName || !pvcMountPath}
										onClick={() => {
											setPvcList([...pvcList, {
												name: pvcVolName,
												pvcName: pvcTargetName,
												mountPath: pvcMountPath,
												readOnly: pvcReadOnly || undefined,
												subPath: pvcSubPath || undefined,
											}]);
											setPvcVolName("");
											setPvcTargetName("");
											setPvcMountPath("");
											setPvcReadOnly(false);
											setPvcSubPath("");
										}}
									>
										<Plus className="size-3.5" /> Add PVC Mount
									</Button>
								</div>
							</div>
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="emptydir" className="space-y-4 mt-3">
					<Card>
						<CardHeader className="px-4 py-3">
							<CardTitle className="text-sm font-semibold">Temporary Storage</CardTitle>
							<CardDescription className="text-xs">Local scratch directories that persist for pod lifetime.</CardDescription>
						</CardHeader>
						<CardContent className="px-4 pb-4 space-y-4">
							{emptyDirList.length > 0 ? (
								<div className="grid gap-2">
									{emptyDirList.map((vol) => (
										<div key={vol.name} className="flex items-center justify-between p-2 rounded-md border bg-muted/30">
											<div className="flex flex-col gap-0.5">
												<div className="flex items-center gap-2">
													<span className="font-mono text-xs font-semibold">{vol.name}</span>
													{vol.medium === "Memory" && <Badge variant="secondary" className="text-[10px] py-0 h-4">RAM Disk</Badge>}
													{vol.sizeLimit && <Badge variant="outline" className="text-[10px] py-0 h-4">{vol.sizeLimit} max</Badge>}
												</div>
												<div className="text-[11px] text-muted-foreground font-mono">
													{vol.mountPath}
												</div>
											</div>
											<Button
												variant="ghost"
												size="sm"
												onClick={() => setEmptyDirList(emptyDirList.filter((v) => v.name !== vol.name))}
												className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
											>
												<Trash2 className="size-3.5" />
											</Button>
										</div>
									))}
								</div>
							) : (
								<VolumeEmptyState label="EmptyDir" />
							)}

							<Separator />

							<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
								<div className="space-y-1.5 lg:col-span-1">
									<Label className="text-xs leading-none">Internal Volume Name</Label>
									<Input
										placeholder="cache-vol"
										className="h-8 text-xs"
										value={edVolName}
										onChange={(e) => setEdVolName(e.target.value)}
									/>
								</div>
								<div className="space-y-1.5 lg:col-span-1">
									<Label className="text-xs leading-none">Mount Path</Label>
									<Input
										placeholder="/tmp/cache"
										className="h-8 text-xs font-mono"
										value={edMountPath}
										onChange={(e) => setEdMountPath(e.target.value)}
									/>
								</div>
								<div className="space-y-1.5 lg:col-span-1">
									<Label className="text-xs leading-none">Storage Medium</Label>
									<Select value={edMedium} onValueChange={setEdMedium}>
										<SelectTrigger className="h-8 text-xs">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="Default">Disk</SelectItem>
											<SelectItem value="Memory">Memory (tmpfs)</SelectItem>
										</SelectContent>
									</Select>
								</div>
								<div className="space-y-1.5 lg:col-span-1">
									<Label className="text-xs leading-none">Size Limit (Optional)</Label>
									<Input
										placeholder="256Mi"
										className="h-8 text-xs"
										value={edSizeLimit}
										onChange={(e) => setEdSizeLimit(e.target.value)}
									/>
								</div>
								<div className="lg:col-span-4 mt-1">
									<Button
										className="h-8 w-full gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
										disabled={!edVolName || !edMountPath}
										onClick={() => {
											setEmptyDirList([...emptyDirList, {
												name: edVolName,
												mountPath: edMountPath,
												medium: edMedium === "Memory" ? "Memory" : undefined,
												sizeLimit: edSizeLimit || undefined,
											}]);
											setEdVolName("");
											setEdMountPath("");
											setEdMedium("Default");
											setEdSizeLimit("");
										}}
									>
										<Plus className="size-3.5" /> Add Temporary Space
									</Button>
								</div>
							</div>
						</CardContent>
					</Card>
				</TabsContent>
			</Tabs>
		</div>
	);
}
