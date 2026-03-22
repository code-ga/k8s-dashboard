"use client";

import { Plus, X, ClipboardPaste } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { toast } from "sonner";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
	DialogFooter,
	DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export interface EnvVar {
	name: string;
	value: string;
}

interface EnvEditorProps {
	variables: EnvVar[];
	onChange: (variables: EnvVar[]) => void;
}

export function EnvEditor({ variables, onChange }: EnvEditorProps) {
	const [pasteValue, setPasteValue] = useState("");
	const [isOpen, setIsOpen] = useState(false);

	const addVarInRange = () => {
		onChange([...variables, { name: "", value: "" }]);
	};

	const parseEnv = (content: string): EnvVar[] => {
		return content
			.split(/\r?\n/)
			.filter((line) => line.trim() && !line.trim().startsWith("#"))
			.map((line) => {
				const indexOfFirstEqual = line.indexOf("=");
				if (indexOfFirstEqual === -1) return null;
				const name = line.substring(0, indexOfFirstEqual).trim();
				let value = line.substring(indexOfFirstEqual + 1).trim();

				// Remove surrounding quotes
				if (
					(value.startsWith('"') && value.endsWith('"')) ||
					(value.startsWith("'") && value.endsWith("'"))
				) {
					value = value.substring(1, value.length - 1);
				}

				return { name, value };
			})
			.filter((v): v is EnvVar => v !== null);
	};

	const handleImport = () => {
		const newVars = parseEnv(pasteValue);
		if (newVars.length > 0) {
			// Filter out empty entries from the current list before appending.
			const currentVars = variables.filter((v) => v.name || v.value);
			onChange([...currentVars, ...newVars]);
			toast.success(`Imported ${newVars.length} variables`);
		} else if (pasteValue.trim()) {
			toast.error("No valid environment variables found");
		}
		setPasteValue("");
		setIsOpen(false);
	};

	const removeVarAt = (index: number) => {
		onChange(variables.filter((_, i) => i !== index));
	};

	const updateVarAt = (index: number, field: keyof EnvVar, value: string) => {
		const updated = [...variables];
		updated[index] = { ...updated[index], [field]: value };
		onChange(updated);
	};

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<Label className="text-sm font-semibold">Environment Variables</Label>
				<div className="flex gap-2">
					<Dialog open={isOpen} onOpenChange={setIsOpen}>
						<DialogTrigger asChild>
							<Button type="button" variant="outline" size="sm" className="h-8">
								<ClipboardPaste className="h-4 w-4 mr-1" /> Paste .env
							</Button>
						</DialogTrigger>
						<DialogContent>
							<DialogHeader>
								<DialogTitle>Paste .env content</DialogTitle>
								<DialogDescription>
									Paste your environment variables in KEY=VALUE format. 
									Lines starting with # will be ignored.
								</DialogDescription>
							</DialogHeader>
							<div className="py-4">
								<Textarea
									placeholder={"APP_NAME=my-app\nPORT=3000\nDATABASE_URL=postgres://..."}
									rows={10}
									value={pasteValue}
									onChange={(e) => setPasteValue(e.target.value)}
									className="font-mono text-xs"
								/>
							</div>
							<DialogFooter>
								<Button variant="outline" onClick={() => setIsOpen(false)}>
									Cancel
								</Button>
								<Button onClick={handleImport}>Import</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={addVarInRange}
						className="h-8"
					>
						<Plus className="h-4 w-4 mr-1" /> Add Variable
					</Button>
				</div>
			</div>

			<div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
				{variables.length === 0 ? (
					<p className="text-sm text-muted-foreground italic text-center py-2">
						No environment variables defined.
					</p>
				) : (
					variables.map((v, index) => (
						<div
							key={`${v.name}-${index}`}
							className="flex gap-2 items-start group"
						>
							<div className="flex-1 space-y-1">
								<Input
									placeholder="NAME"
									value={v.name}
									onChange={(e) => updateVarAt(index, "name", e.target.value)}
									className="h-9 font-mono text-xs"
								/>
							</div>
							<div className="flex-1 space-y-1">
								<Input
									placeholder="value"
									value={v.value}
									onChange={(e) => updateVarAt(index, "value", e.target.value)}
									className="h-9 font-mono text-xs"
								/>
							</div>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								onClick={() => removeVarAt(index)}
								className="h-9 w-9 text-muted-foreground hover:text-destructive"
							>
								<X className="h-4 w-4" />
							</Button>
						</div>
					))
				)}
			</div>
		</div>
	);
}
