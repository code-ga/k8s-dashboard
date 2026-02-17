"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface EnvVar {
	name: string;
	value: string;
}

interface EnvEditorProps {
	variables: EnvVar[];
	onChange: (variables: EnvVar[]) => void;
}

export function EnvEditor({ variables, onChange }: EnvEditorProps) {
	const addVarInRange = () => {
		onChange([...variables, { name: "", value: "" }]);
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
