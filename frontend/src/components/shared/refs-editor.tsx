import { useQuery } from "@tanstack/react-query";
import { Database, HelpCircle, Key, Layers, Plus, Tag, X } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";

export interface IConfigMapEnvRef {
	name: string;
	configMapName: string;
	key: string;
}

export interface IConfigMapEnvFromRef {
	configMapName: string;
	prefix?: string;
}

export interface ISecretEnvRef {
	name: string;
	secretName: string;
	key: string;
}

export interface ISecretEnvFromRef {
	secretName: string;
	prefix?: string;
}

interface RefsEditorProps {
	clusterId: string;
	configMapRefs?: {
		env?: IConfigMapEnvRef[];
		envFrom?: IConfigMapEnvFromRef[];
	};
	secretRefs?: {
		env?: ISecretEnvRef[];
		envFrom?: ISecretEnvFromRef[];
	};
	onChange?: (refs: {
		configMapRefs: {
			env?: IConfigMapEnvRef[];
			envFrom?: IConfigMapEnvFromRef[];
		};
		secretRefs: {
			env?: ISecretEnvRef[];
			envFrom?: ISecretEnvFromRef[];
		};
	}) => void;
}

function HelpDialog() {
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="h-7 gap-1.5 text-muted-foreground hover:text-foreground"
				>
					<HelpCircle className="size-3.5" />
					<span className="text-xs">How it works</span>
				</Button>
			</DialogTrigger>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<HelpCircle className="size-4 text-primary" />
						Environment References Guide
					</DialogTitle>
					<DialogDescription>
						Inject values from ConfigMaps and Secrets into your container's
						environment.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 text-sm">
					{/* ConfigMap section */}
					<div className="space-y-2">
						<div className="flex items-center gap-2 font-semibold text-blue-600">
							<Database className="size-4" />
							ConfigMap
						</div>

						<div className="rounded-lg border bg-muted/40 p-3 space-y-1">
							<div className="flex items-center gap-1.5 font-medium text-xs">
								<Tag className="size-3.5 text-blue-500" />
								Single Key — <code className="text-blue-600">env</code>
							</div>
							<p className="text-xs text-muted-foreground leading-relaxed">
								Maps one specific key from a ConfigMap to an environment
								variable. You must provide the <b>env var name</b>, the{" "}
								<b>ConfigMap</b> to read from, and the <b>key</b> within it.
							</p>
							<div className="mt-1.5 rounded bg-background border px-2 py-1 font-mono text-xs text-muted-foreground">
								MY_VAR ← my-configmap / database_url
							</div>
						</div>

						<div className="rounded-lg border bg-muted/40 p-3 space-y-1">
							<div className="flex items-center gap-1.5 font-medium text-xs">
								<Layers className="size-3.5 text-blue-500" />
								All Keys — <code className="text-blue-600">envFrom</code>
							</div>
							<p className="text-xs text-muted-foreground leading-relaxed">
								Imports <b>all keys</b> from a ConfigMap as environment
								variables at once. Optionally add a <b>prefix</b> to avoid name
								conflicts.
							</p>
							<div className="mt-1.5 rounded bg-background border px-2 py-1 font-mono text-xs text-muted-foreground">
								my-configmap (prefix: APP_) → APP_KEY1, APP_KEY2, …
							</div>
						</div>
					</div>

					<Separator />

					{/* Secret section */}
					<div className="space-y-2">
						<div className="flex items-center gap-2 font-semibold text-amber-600">
							<Key className="size-4" />
							Secret
						</div>

						<div className="rounded-lg border bg-muted/40 p-3 space-y-1">
							<div className="flex items-center gap-1.5 font-medium text-xs">
								<Tag className="size-3.5 text-amber-500" />
								Single Key — <code className="text-amber-600">env</code>
							</div>
							<p className="text-xs text-muted-foreground leading-relaxed">
								Same as ConfigMap env, but reads from a Kubernetes <b>Secret</b>
								. Values are base64-decoded automatically.
							</p>
							<div className="mt-1.5 rounded bg-background border px-2 py-1 font-mono text-xs text-muted-foreground">
								DB_PASSWORD ← my-secret / password
							</div>
						</div>

						<div className="rounded-lg border bg-muted/40 p-3 space-y-1">
							<div className="flex items-center gap-1.5 font-medium text-xs">
								<Layers className="size-3.5 text-amber-500" />
								All Keys — <code className="text-amber-600">envFrom</code>
							</div>
							<p className="text-xs text-muted-foreground leading-relaxed">
								Imports all keys from a Secret as environment variables. Use an
								optional <b>prefix</b> to namespace them.
							</p>
							<div className="mt-1.5 rounded bg-background border px-2 py-1 font-mono text-xs text-muted-foreground">
								my-secret (prefix: SECRET_) → SECRET_KEY1, SECRET_KEY2, …
							</div>
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}

function EmptyState({ label }: { label: string }) {
	return (
		<p className="text-xs text-muted-foreground italic py-1">
			No {label} added yet.
		</p>
	);
}

export default function RefsEditor({
	clusterId,
	configMapRefs,
	secretRefs,
	onChange,
}: RefsEditorProps) {
	const { data: configMaps } = useQuery({
		queryKey: ["configmaps", clusterId, "refs-editor"],
		queryFn: async () => {
			const res = await api.api.configmaps({ clusterId }).get();
			if (res.error) throw res.error;
			return res.data.data;
		},
	});

	const { data: secrets } = useQuery({
		queryKey: ["secrets", clusterId, "refs-editor"],
		queryFn: async () => {
			const res = await api.api.secrets({ clusterId }).get();
			if (res.error) throw res.error;
			return res.data.data;
		},
	});

	// Lists
	const [cmEnv, setCmEnv] = useState<IConfigMapEnvRef[]>(
		configMapRefs?.env || [],
	);
	const [cmEnvFrom, setCmEnvFrom] = useState<IConfigMapEnvFromRef[]>(
		configMapRefs?.envFrom || [],
	);
	const [sEnv, setSEnv] = useState<ISecretEnvRef[]>(secretRefs?.env || []);
	const [sEnvFrom, setSEnvFrom] = useState<ISecretEnvFromRef[]>(
		secretRefs?.envFrom || [],
	);

	// ConfigMap Env form
	const [cmEnvName, setCmEnvName] = useState("");
	const [cmEnvCm, setCmEnvCm] = useState("");
	const [cmEnvKey, setCmEnvKey] = useState("");

	// ConfigMap EnvFrom form
	const [cmFromCm, setCmFromCm] = useState("");
	const [cmFromPrefix, setCmFromPrefix] = useState("");

	// Secret Env form
	const [sEnvName, setSEnvName] = useState("");
	const [sEnvSecret, setSEnvSecret] = useState("");
	const [sEnvKey, setSEnvKey] = useState("");

	// Secret EnvFrom form
	const [sFromSecret, setSFromSecret] = useState("");
	const [sFromPrefix, setSFromPrefix] = useState("");

	useEffect(() => {
		setCmEnv(configMapRefs?.env || []);
		setCmEnvFrom(configMapRefs?.envFrom || []);
		setSEnv(secretRefs?.env || []);
		setSEnvFrom(secretRefs?.envFrom || []);
	}, [configMapRefs, secretRefs]);

	// Keep a ref to the latest onChange so it never needs to be a dep,
	// avoiding re-fires when the parent recreates the callback each render.
	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;

	// Skip the first render — calling onChange on mount would push the
	// initial state back to the parent and can trigger an infinite loop.
	const isMounted = useRef(false);

	useEffect(() => {
		if (!isMounted.current) {
			isMounted.current = true;
			return;
		}
		onChangeRef.current?.({
			configMapRefs: { env: cmEnv, envFrom: cmEnvFrom },
			secretRefs: { env: sEnv, envFrom: sEnvFrom },
		});
	}, [cmEnv, cmEnvFrom, sEnv, sEnvFrom]);

	const cmCount = cmEnv.length + cmEnvFrom.length;
	const sCount = sEnv.length + sEnvFrom.length;

	return (
		<div className="space-y-3">
			{/* Header */}
			<div className="flex items-start justify-between gap-2">
				<div>
					<p className="text-xs text-muted-foreground">
						Inject values from ConfigMaps and Secrets as environment variables.
					</p>
				</div>
				<HelpDialog />
			</div>

			<Tabs defaultValue="configmap" className="w-full">
				<TabsList className="grid w-full grid-cols-2 h-9">
					<TabsTrigger value="configmap" className="gap-1.5 text-xs">
						<Database className="size-3.5 text-blue-500" />
						ConfigMap
						{cmCount > 0 && (
							<Badge
								variant="secondary"
								className="ml-0.5 h-4 px-1 text-[10px] leading-none"
							>
								{cmCount}
							</Badge>
						)}
					</TabsTrigger>
					<TabsTrigger value="secret" className="gap-1.5 text-xs">
						<Key className="size-3.5 text-amber-500" />
						Secret
						{sCount > 0 && (
							<Badge
								variant="secondary"
								className="ml-0.5 h-4 px-1 text-[10px] leading-none"
							>
								{sCount}
							</Badge>
						)}
					</TabsTrigger>
				</TabsList>

				{/* ───── ConfigMap tab ───── */}
				<TabsContent value="configmap" className="space-y-3 mt-3">
					{/* Single key */}
					<Card>
						<CardHeader className="px-4 pt-4 pb-2">
							<div className="flex items-center gap-2">
								<Tag className="size-3.5 text-blue-500 shrink-0" />
								<div>
									<CardTitle className="text-xs font-semibold">
										Single Key&nbsp;
										<code className="rounded bg-muted px-1 py-0.5 text-[10px] font-normal text-blue-600">
											env
										</code>
									</CardTitle>
									<CardDescription className="text-[11px] mt-0.5">
										Map a specific key to an env var
									</CardDescription>
								</div>
							</div>
						</CardHeader>
						<CardContent className="px-4 pb-4 space-y-3">
							{cmEnv.length > 0 ? (
								<div className="flex flex-wrap gap-1.5">
									{cmEnv.map((r, i) => (
										<span
											key={`${r.name}-${r.configMapName}-${r.key}-${i}`}
											className="inline-flex items-center gap-1 rounded-md border bg-muted/60 px-2 py-0.5 text-xs"
										>
											<span className="font-mono font-medium">{r.name}</span>
											<span className="text-muted-foreground text-[10px]">
												←
											</span>
											<span className="font-mono text-blue-600 text-[11px]">
												{r.configMapName}/{r.key}
											</span>
											<button
												type="button"
												onClick={() =>
													setCmEnv(cmEnv.filter((_, idx) => idx !== i))
												}
												className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors"
											>
												<X className="size-3" />
											</button>
										</span>
									))}
								</div>
							) : (
								<EmptyState label="single-key refs" />
							)}

							<Separator />

							<div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1.2fr_1fr_auto] sm:items-end">
								<div className="space-y-1">
									<Label className="text-xs">Env Var Name</Label>
									<Input
										className="h-8 text-xs"
										placeholder="MY_VAR"
										value={cmEnvName}
										onChange={(e) => setCmEnvName(e.target.value)}
									/>
								</div>
								<div className="space-y-1">
									<Label className="text-xs">ConfigMap</Label>
									<Select value={cmEnvCm} onValueChange={setCmEnvCm}>
										<SelectTrigger className="h-8 text-xs w-full">
											<SelectValue placeholder="Select ConfigMap" />
										</SelectTrigger>
										<SelectContent>
											{configMaps?.map((cm) => (
												<SelectItem key={cm.id} value={cm.name}>
													{cm.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								<div className="space-y-1">
									<Label className="text-xs">Key</Label>
									<Input
										className="h-8 text-xs"
										placeholder="key_name"
										value={cmEnvKey}
										onChange={(e) => setCmEnvKey(e.target.value)}
									/>
								</div>
								<Button
									size="sm"
									className="h-8 gap-1 text-xs w-full sm:w-auto"
									disabled={!cmEnvName || !cmEnvCm || !cmEnvKey}
									onClick={() => {
										setCmEnv([
											...cmEnv,
											{
												name: cmEnvName,
												configMapName: cmEnvCm,
												key: cmEnvKey,
											},
										]);
										setCmEnvName("");
										setCmEnvCm("");
										setCmEnvKey("");
									}}
								>
									<Plus className="size-3.5" />
									Add
								</Button>
							</div>
						</CardContent>
					</Card>

					{/* All keys */}
					<Card>
						<CardHeader className="px-4 pt-4 pb-2">
							<div className="flex items-center gap-2">
								<Layers className="size-3.5 text-blue-500 shrink-0" />
								<div>
									<CardTitle className="text-xs font-semibold">
										All Keys&nbsp;
										<code className="rounded bg-muted px-1 py-0.5 text-[10px] font-normal text-blue-600">
											envFrom
										</code>
									</CardTitle>
									<CardDescription className="text-[11px] mt-0.5">
										Import every key from a ConfigMap
									</CardDescription>
								</div>
							</div>
						</CardHeader>
						<CardContent className="px-4 pb-4 space-y-3">
							{cmEnvFrom.length > 0 ? (
								<div className="flex flex-wrap gap-1.5">
									{cmEnvFrom.map((r, i) => (
										<span
											key={`${r.configMapName}-${r.prefix}-${i}`}
											className="inline-flex items-center gap-1 rounded-md border bg-muted/60 px-2 py-0.5 text-xs"
										>
											<span className="font-mono text-blue-600 text-[11px]">
												{r.configMapName}
											</span>
											{r.prefix && (
												<span className="text-muted-foreground text-[10px]">
													prefix:{" "}
													<span className="font-mono font-medium">
														{r.prefix}
													</span>
												</span>
											)}
											<button
												type="button"
												onClick={() =>
													setCmEnvFrom(cmEnvFrom.filter((_, idx) => idx !== i))
												}
												className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors"
											>
												<X className="size-3" />
											</button>
										</span>
									))}
								</div>
							) : (
								<EmptyState label="all-key refs" />
							)}

							<Separator />

							<div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
								<div className="space-y-1">
									<Label className="text-xs">ConfigMap</Label>
									<Select value={cmFromCm} onValueChange={setCmFromCm}>
										<SelectTrigger className="h-8 text-xs w-full">
											<SelectValue placeholder="Select ConfigMap" />
										</SelectTrigger>
										<SelectContent>
											{configMaps?.map((cm) => (
												<SelectItem key={cm.id} value={cm.name}>
													{cm.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								<div className="space-y-1">
									<Label className="text-xs">
										Prefix{" "}
										<span className="text-muted-foreground font-normal">
											(optional)
										</span>
									</Label>
									<Input
										className="h-8 text-xs"
										placeholder="APP_"
										value={cmFromPrefix}
										onChange={(e) => setCmFromPrefix(e.target.value)}
									/>
								</div>
								<Button
									size="sm"
									className="h-8 gap-1 text-xs w-full sm:w-auto"
									disabled={!cmFromCm}
									onClick={() => {
										setCmEnvFrom([
											...cmEnvFrom,
											{
												configMapName: cmFromCm,
												prefix: cmFromPrefix || undefined,
											},
										]);
										setCmFromCm("");
										setCmFromPrefix("");
									}}
								>
									<Plus className="size-3.5" />
									Add
								</Button>
							</div>
						</CardContent>
					</Card>
				</TabsContent>

				{/* ───── Secret tab ───── */}
				<TabsContent value="secret" className="space-y-3 mt-3">
					{/* Single key */}
					<Card>
						<CardHeader className="px-4 pt-4 pb-2">
							<div className="flex items-center gap-2">
								<Tag className="size-3.5 text-amber-500 shrink-0" />
								<div>
									<CardTitle className="text-xs font-semibold">
										Single Key&nbsp;
										<code className="rounded bg-muted px-1 py-0.5 text-[10px] font-normal text-amber-600">
											env
										</code>
									</CardTitle>
									<CardDescription className="text-[11px] mt-0.5">
										Map a specific key to an env var
									</CardDescription>
								</div>
							</div>
						</CardHeader>
						<CardContent className="px-4 pb-4 space-y-3">
							{sEnv.length > 0 ? (
								<div className="flex flex-wrap gap-1.5">
									{sEnv.map((r, i) => (
										<span
											key={`${r.name}-${r.secretName}-${r.key}-${i}`}
											className="inline-flex items-center gap-1 rounded-md border bg-muted/60 px-2 py-0.5 text-xs"
										>
											<span className="font-mono font-medium">{r.name}</span>
											<span className="text-muted-foreground text-[10px]">
												←
											</span>
											<span className="font-mono text-amber-600 text-[11px]">
												{r.secretName}/{r.key}
											</span>
											<button
												type="button"
												onClick={() =>
													setSEnv(sEnv.filter((_, idx) => idx !== i))
												}
												className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors"
											>
												<X className="size-3" />
											</button>
										</span>
									))}
								</div>
							) : (
								<EmptyState label="single-key refs" />
							)}

							<Separator />

							<div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1.2fr_1fr_auto] sm:items-end">
								<div className="space-y-1">
									<Label className="text-xs">Env Var Name</Label>
									<Input
										className="h-8 text-xs"
										placeholder="DB_PASSWORD"
										value={sEnvName}
										onChange={(e) => setSEnvName(e.target.value)}
									/>
								</div>
								<div className="space-y-1">
									<Label className="text-xs">Secret</Label>
									<Select value={sEnvSecret} onValueChange={setSEnvSecret}>
										<SelectTrigger className="h-8 text-xs w-full">
											<SelectValue placeholder="Select Secret" />
										</SelectTrigger>
										<SelectContent>
											{secrets?.map((s) => (
												<SelectItem key={s.id} value={s.name}>
													{s.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								<div className="space-y-1">
									<Label className="text-xs">Key</Label>
									<Input
										className="h-8 text-xs"
										placeholder="password"
										value={sEnvKey}
										onChange={(e) => setSEnvKey(e.target.value)}
									/>
								</div>
								<Button
									size="sm"
									className="h-8 gap-1 text-xs w-full sm:w-auto"
									disabled={!sEnvName || !sEnvSecret || !sEnvKey}
									onClick={() => {
										setSEnv([
											...sEnv,
											{
												name: sEnvName,
												secretName: sEnvSecret,
												key: sEnvKey,
											},
										]);
										setSEnvName("");
										setSEnvSecret("");
										setSEnvKey("");
									}}
								>
									<Plus className="size-3.5" />
									Add
								</Button>
							</div>
						</CardContent>
					</Card>

					{/* All keys */}
					<Card>
						<CardHeader className="px-4 pt-4 pb-2">
							<div className="flex items-center gap-2">
								<Layers className="size-3.5 text-amber-500 shrink-0" />
								<div>
									<CardTitle className="text-xs font-semibold">
										All Keys&nbsp;
										<code className="rounded bg-muted px-1 py-0.5 text-[10px] font-normal text-amber-600">
											envFrom
										</code>
									</CardTitle>
									<CardDescription className="text-[11px] mt-0.5">
										Import every key from a Secret
									</CardDescription>
								</div>
							</div>
						</CardHeader>
						<CardContent className="px-4 pb-4 space-y-3">
							{sEnvFrom.length > 0 ? (
								<div className="flex flex-wrap gap-1.5">
									{sEnvFrom.map((r, i) => (
										<span
											key={`${r.secretName}-${r.prefix}-${i}`}
											className="inline-flex items-center gap-1 rounded-md border bg-muted/60 px-2 py-0.5 text-xs"
										>
											<span className="font-mono text-amber-600 text-[11px]">
												{r.secretName}
											</span>
											{r.prefix && (
												<span className="text-muted-foreground text-[10px]">
													prefix:{" "}
													<span className="font-mono font-medium">
														{r.prefix}
													</span>
												</span>
											)}
											<button
												type="button"
												onClick={() =>
													setSEnvFrom(sEnvFrom.filter((_, idx) => idx !== i))
												}
												className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors"
											>
												<X className="size-3" />
											</button>
										</span>
									))}
								</div>
							) : (
								<EmptyState label="all-key refs" />
							)}

							<Separator />

							<div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
								<div className="space-y-1">
									<Label className="text-xs">Secret</Label>
									<Select value={sFromSecret} onValueChange={setSFromSecret}>
										<SelectTrigger className="h-8 text-xs w-full">
											<SelectValue placeholder="Select Secret" />
										</SelectTrigger>
										<SelectContent>
											{secrets?.map((s) => (
												<SelectItem key={s.id} value={s.name}>
													{s.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								<div className="space-y-1">
									<Label className="text-xs">
										Prefix{" "}
										<span className="text-muted-foreground font-normal">
											(optional)
										</span>
									</Label>
									<Input
										className="h-8 text-xs"
										placeholder="SECRET_"
										value={sFromPrefix}
										onChange={(e) => setSFromPrefix(e.target.value)}
									/>
								</div>
								<Button
									size="sm"
									className="h-8 gap-1 text-xs w-full sm:w-auto"
									disabled={!sFromSecret}
									onClick={() => {
										setSEnvFrom([
											...sEnvFrom,
											{
												secretName: sFromSecret,
												prefix: sFromPrefix || undefined,
											},
										]);
										setSFromSecret("");
										setSFromPrefix("");
									}}
								>
									<Plus className="size-3.5" />
									Add
								</Button>
							</div>
						</CardContent>
					</Card>
				</TabsContent>
			</Tabs>
		</div>
	);
}
