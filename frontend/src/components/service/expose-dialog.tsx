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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Globe } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useForm } from "@tanstack/react-form";
// import { zodValidator } from "@tanstack/zod-form-adapter";
import { z } from "zod";

const exposeSchema = z.object({
	name: z.string().min(1, "Name is required"),
	namespace: z.string().min(1, "Namespace is required"),
	protocol: z.enum(["http", "tcp", "udp"]),
	internalPort: z.number().min(1).max(65535),
	externalPort: z.number().optional(),
	domain: z.string().optional(),
});

interface ExposeDialogProps {
	clusterId: string;
	defaultName: string;
	defaultNamespace: string;
	defaultInternalPort?: number;
	selector: Record<string, string>;
	trigger?: React.ReactNode;
}

export function ExposeDialog({
	clusterId,
	defaultName,
	defaultNamespace,
	defaultInternalPort,
	selector,
	trigger,
}: ExposeDialogProps) {
	const [open, setOpen] = useState(false);
	const queryClient = useQueryClient();

	const mutation = useMutation({
		mutationFn: async (values: z.infer<typeof exposeSchema>) => {
			const res = await api.api.services({ clusterId: clusterId }).expose.post({
				name: values.name,
				namespace: values.namespace,
				protocol: values.protocol,
				internalPort: values.internalPort,
				externalPort: values.externalPort,
				domain: values.domain || undefined,
				selector: selector,
			});

			if (res.error) {
				throw new Error(res.error.value?.message || "Failed to expose service");
			}

			return res.data;
		},
		onSuccess: () => {
			toast.success("Service exposed successfully");
			queryClient.invalidateQueries({ queryKey: ["services", clusterId] });
			setOpen(false);
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});

	const form = useForm({
		defaultValues: {
			name: `${defaultName}-svc`,
			namespace: defaultNamespace,
			protocol: "http" as "http" | "tcp" | "udp",
			internalPort: defaultInternalPort || 80,
			externalPort: undefined as number | undefined,
			domain: "",
		},
		// validatorAdapter: zodValidator(),
		// validators: {
		// 	onChange: exposeSchema,
		// },
		onSubmit: async ({ value }) => {
			await mutation.mutateAsync(value);
		},
    
	});

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				{trigger || (
					<Button variant="outline" size="sm">
						<Globe className="mr-2 h-4 w-4" /> Expose
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-[500px]">
				<DialogHeader>
					<DialogTitle>Expose Resource</DialogTitle>
					<DialogDescription>
						Make this resource accessible from the internet or cluster gateway.
					</DialogDescription>
				</DialogHeader>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
					className="space-y-4 py-4"
				>
					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label htmlFor="name">Service Name</Label>
							<form.Field name="name">
								{(field) => (
									<Input
										id="name"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										placeholder="my-service"
									/>
								)}
							</form.Field>
						</div>
						<div className="space-y-2">
							<Label htmlFor="namespace">Namespace</Label>
							<form.Field name="namespace">
								{(field) => (
									<Input
										id="namespace"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										disabled
									/>
								)}
							</form.Field>
						</div>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label htmlFor="protocol">Protocol</Label>
							<form.Field name="protocol">
								{(field) => (
									<Select
										value={field.state.value}
										onValueChange={(value) =>
											field.handleChange(value as "http" | "tcp" | "udp")
										}
									>
										<SelectTrigger id="protocol">
											<SelectValue placeholder="Select protocol" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="http">HTTP</SelectItem>
											<SelectItem value="tcp">TCP</SelectItem>
											<SelectItem value="udp">UDP</SelectItem>
										</SelectContent>
									</Select>
								)}
							</form.Field>
						</div>
						<div className="space-y-2">
							<Label htmlFor="internalPort">Internal Port</Label>
							<form.Field name="internalPort">
								{(field) => (
									<Input
										id="internalPort"
										type="number"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(Number(e.target.value))}
										placeholder="80"
									/>
								)}
							</form.Field>
						</div>
					</div>

					<form.Subscribe selector={(state) => state.values.protocol}>
						{(protocol) => (
							<>
								{protocol === "http" && (
									<div className="space-y-2">
										<Label htmlFor="domain">Domain</Label>
										<form.Field name="domain">
											{(field) => (
												<Input
													id="domain"
													value={field.state.value}
													onBlur={field.handleBlur}
													onChange={(e) => field.handleChange(e.target.value)}
													placeholder="myapp.example.com"
												/>
											)}
										</form.Field>
									</div>
								)}
								{protocol !== "http" && (
									<div className="space-y-2">
										<Label htmlFor="externalPort">
											External Port (Optional)
										</Label>
										<form.Field name="externalPort">
											{(field) => (
												<Input
													id="externalPort"
													type="number"
													value={field.state.value || ""}
													onBlur={field.handleBlur}
													onChange={(e) =>
														field.handleChange(
															e.target.value
																? Number(e.target.value)
																: undefined,
														)
													}
													placeholder="Auto-allocate"
												/>
											)}
										</form.Field>
										<p className="text-[10px] text-muted-foreground italic">
											If left empty, the system will automatically allocate a
											port between 30000-31000.
										</p>
									</div>
								)}
							</>
						)}
					</form.Subscribe>

					<div className="bg-muted p-3 rounded-md">
						<Label className="text-xs uppercase text-muted-foreground font-bold">
							Selector
						</Label>
						<div className="mt-1 font-mono text-xs">
							{Object.entries(selector).map(([key, value]) => (
								<div key={key}>
									{key}: {value}
								</div>
							))}
						</div>
					</div>

					<DialogFooter>
						<Button type="submit" disabled={mutation.isPending}>
							{mutation.isPending ? "Exposing..." : "Expose Port"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
