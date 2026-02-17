import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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

	// temp inputs
	const [cmName, setCmName] = useState("");
	const [cmKey, setCmKey] = useState("");
	const [cmFromName, setCmFromName] = useState("");
	const [cmFromPrefix, setCmFromPrefix] = useState("");

	const [sName, setSName] = useState("");
	const [sKey, setSKey] = useState("");
	const [sFromName, setSFromName] = useState("");
	const [sFromPrefix, setSFromPrefix] = useState("");

	useEffect(() => {
		setCmEnv(configMapRefs?.env || []);
		setCmEnvFrom(configMapRefs?.envFrom || []);
		setSEnv(secretRefs?.env || []);
		setSEnvFrom(secretRefs?.envFrom || []);
	}, [configMapRefs, secretRefs]);

	// notify parent
	useEffect(() => {
		onChange?.({
			configMapRefs: { env: cmEnv, envFrom: cmEnvFrom },
			secretRefs: { env: sEnv, envFrom: sEnvFrom },
		});
	}, [cmEnv, cmEnvFrom, sEnv, sEnvFrom]);

	return (
		<div className="space-y-4">
			<div>
				<h4 className="text-sm font-medium">ConfigMap - Env</h4>
				{cmEnv.map((r, i: number) => (
					<div
						key={`${r.name}-${r.configMapName}-${r.key}-${i}`}
						className="flex items-center justify-between gap-2"
					>
						<div className="text-sm">
							{r.name} ← {r.configMapName}/{r.key}
						</div>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setCmEnv(cmEnv.filter((_, idx) => idx !== i))}
						>
							Remove
						</Button>
					</div>
				))}

				<div className="grid grid-cols-3 gap-2 items-end mt-2">
					<div>
						<Label>Env Name</Label>
						<Input value={cmName} onChange={(e) => setCmName(e.target.value)} />
					</div>
					<div>
						<Label>ConfigMap</Label>
						<Select onValueChange={(v) => setCmFromName(v)}>
							<SelectTrigger className="w-full">
								<SelectValue placeholder="Select" />
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
					<div>
						<Label>Key</Label>
						<Input value={cmKey} onChange={(e) => setCmKey(e.target.value)} />
					</div>
					<div />
					<div />
					<div>
						<Button
							size="sm"
							onClick={() => {
								if (!cmName || !cmFromName || !cmKey) return;
								setCmEnv([
									...cmEnv,
									{ name: cmName, configMapName: cmFromName, key: cmKey },
								]);
								setCmName("");
								setCmFromName("");
								setCmKey("");
							}}
						>
							Add
						</Button>
					</div>
				</div>
			</div>

			<div>
				<h4 className="text-sm font-medium">ConfigMap - EnvFrom</h4>
				{cmEnvFrom.map((r, i: number) => (
					<div
						key={`${r.configMapName}-${r.prefix}-${i}`}
						className="flex items-center justify-between gap-2"
					>
						<div className="text-sm">
							{r.configMapName} {r.prefix ? `(prefix: ${r.prefix})` : ""}
						</div>
						<Button
							variant="ghost"
							size="sm"
							onClick={() =>
								setCmEnvFrom(cmEnvFrom.filter((_, idx) => idx !== i))
							}
						>
							Remove
						</Button>
					</div>
				))}
				<div className="grid grid-cols-3 gap-2 items-end mt-2">
					<div>
						<Label>ConfigMap</Label>
						<Select onValueChange={(v) => setCmFromName(v)}>
							<SelectTrigger className="w-full">
								<SelectValue placeholder="Select" />
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
					<div>
						<Label>Prefix (optional)</Label>
						<Input
							value={cmFromPrefix}
							onChange={(e) => setCmFromPrefix(e.target.value)}
						/>
					</div>
					<div>
						<Button
							size="sm"
							onClick={() => {
								if (!cmFromName) return;
								setCmEnvFrom([
									...cmEnvFrom,
									{
										configMapName: cmFromName,
										prefix: cmFromPrefix || undefined,
									},
								]);
								setCmFromName("");
								setCmFromPrefix("");
							}}
						>
							Add
						</Button>
					</div>
				</div>
			</div>

			<div>
				<h4 className="text-sm font-medium">Secret - Env</h4>
				{sEnv.map((r, i: number) => (
					<div
						key={`${r.name}-${r.secretName}-${r.key}-${i}`}
						className="flex items-center justify-between gap-2"
					>
						<div className="text-sm">
							{r.name} ← {r.secretName}/{r.key}
						</div>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setSEnv(sEnv.filter((_, idx) => idx !== i))}
						>
							Remove
						</Button>
					</div>
				))}

				<div className="grid grid-cols-3 gap-2 items-end mt-2">
					<div>
						<Label>Env Name</Label>
						<Input value={sName} onChange={(e) => setSName(e.target.value)} />
					</div>
					<div>
						<Label>Secret</Label>
						<Select onValueChange={(v) => setSFromName(v)}>
							<SelectTrigger className="w-full">
								<SelectValue placeholder="Select" />
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
					<div>
						<Label>Key</Label>
						<Input value={sKey} onChange={(e) => setSKey(e.target.value)} />
					</div>
					<div />
					<div />
					<div>
						<Button
							size="sm"
							onClick={() => {
								if (!sName || !sFromName || !sKey) return;
								setSEnv([
									...sEnv,
									{ name: sName, secretName: sFromName, key: sKey },
								]);
								setSName("");
								setSFromName("");
								setSKey("");
							}}
						>
							Add
						</Button>
					</div>
				</div>
			</div>

			<div>
				<h4 className="text-sm font-medium">Secret - EnvFrom</h4>
				{sEnvFrom.map((r, i: number) => (
					<div
						key={`${r.secretName}-${r.prefix}-${i}`}
						className="flex items-center justify-between gap-2"
					>
						<div className="text-sm">
							{r.secretName} {r.prefix ? `(prefix: ${r.prefix})` : ""}
						</div>
						<Button
							variant="ghost"
							size="sm"
							onClick={() =>
								setSEnvFrom(sEnvFrom.filter((_, idx) => idx !== i))
							}
						>
							Remove
						</Button>
					</div>
				))}
				<div className="grid grid-cols-3 gap-2 items-end mt-2">
					<div>
						<Label>Secret</Label>
						<Select onValueChange={(v) => setSFromName(v)}>
							<SelectTrigger className="w-full">
								<SelectValue placeholder="Select" />
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
					<div>
						<Label>Prefix (optional)</Label>
						<Input
							value={sFromPrefix}
							onChange={(e) => setSFromPrefix(e.target.value)}
						/>
					</div>
					<div>
						<Button
							size="sm"
							onClick={() => {
								if (!sFromName) return;
								setSEnvFrom([
									...sEnvFrom,
									{ secretName: sFromName, prefix: sFromPrefix || undefined },
								]);
								setSFromName("");
								setSFromPrefix("");
							}}
						>
							Add
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
