import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, getEdenErrorMessage, type SchemaType } from "@/lib/api";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

type Role = SchemaType["role"];

const roleFormSchema = z.object({
	name: z.string().min(2, "Name must be at least 2 characters."),
	description: z.string().optional().nullable(),
	permissions: z.array(z.string()).min(1, "Select at least one permission."),
});

type RoleFormValues = z.infer<typeof roleFormSchema>;

interface RoleDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	role?: Role | null;
}

export function RoleDialog({ open, onOpenChange, role }: RoleDialogProps) {
	const queryClient = useQueryClient();
	const isEditing = !!role;

	const form = useForm<RoleFormValues>({
		resolver: zodResolver(roleFormSchema),
		defaultValues: {
			name: "",
			description: "",
			permissions: [],
		},
	});

	useEffect(() => {
		if (open) {
			if (role) {
				form.reset({
					name: role.name,
					description: role.description || "",
					permissions: role.permissions,
				});
			} else {
				form.reset({
					name: "",
					description: "",
					permissions: [],
				});
			}
		}
	}, [open, role, form]);

	const { data: permissionGroups } = useQuery({
		queryKey: ["all-permissions"],
		queryFn: async () => {
			const res = await api.api.role["all-permissions"].get();
			if (res.error) throw new Error(getEdenErrorMessage(res.error));
			return res.data.data;
		},
	});

	const createMutation = useMutation({
		mutationFn: async (values: RoleFormValues) => {
			const res = await api.api.role.post({
				...values,
				description: values.description ?? null,
			});
			if (res.error) throw new Error(getEdenErrorMessage(res.error));
			return res.data;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["roles"] });
			toast.success("Role created successfully");
			onOpenChange(false);
		},
		onError: (error) => {
			toast.error(`Failed to create role: ${error.message}`);
		},
	});

	const updateMutation = useMutation({
		mutationFn: async (values: RoleFormValues) => {
			if (!role) throw new Error("No role to update");
			const res = await api.api.role({ id: String(role.id) }).patch({
				...values,
				description: values.description ?? null,
			});
			if (res.error) throw new Error(getEdenErrorMessage(res.error));
			return res.data;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["roles"] });
			toast.success("Role updated successfully");
			onOpenChange(false);
		},
		onError: (error) => {
			toast.error(`Failed to update role: ${error.message}`);
		},
	});

	const onSubmit = (values: RoleFormValues) => {
		if (isEditing) {
			updateMutation.mutate(values);
		} else {
			createMutation.mutate(values);
		}
	};

	const isPending = createMutation.isPending || updateMutation.isPending;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>{isEditing ? "Edit Role" : "Create Role"}</DialogTitle>
					<DialogDescription>
						{isEditing
							? "Modify the role's details and permissions."
							: "Create a new role and assign permissions."}
					</DialogDescription>
				</DialogHeader>

				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Name</FormLabel>
									<FormControl>
										<Input placeholder="e.g., developer" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="description"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Description</FormLabel>
									<FormControl>
										<Textarea
											placeholder="Brief description of this role"
											value={field.value || ""}
											onChange={field.onChange}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<div className="space-y-4">
							<div>
								<h4 className="text-sm font-medium leading-none mb-3">
									Permissions
								</h4>
								<FormMessage>
									{form.formState.errors.permissions?.message}
								</FormMessage>
							</div>

							<Accordion type="multiple" className="w-full">
								{permissionGroups?.map((group) => (
									<AccordionItem key={group.resource} value={group.resource}>
										<AccordionTrigger className="hover:no-underline">
											<div className="flex flex-col items-start gap-1">
												<span className="font-semibold capitalize">
													{group.resource}
												</span>
												<span className="text-sm text-muted-foreground font-normal">
													{group.description}
												</span>
											</div>
										</AccordionTrigger>
										<AccordionContent>
											<div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
												{group.permissions.map((perm) => (
													<FormField
														key={perm.id}
														control={form.control}
														name="permissions"
														render={({ field }) => {
															return (
																<FormItem
																	key={perm.id}
																	className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4"
																>
																	<FormControl>
																		<Checkbox
																			checked={field.value?.includes(perm.id)}
																			onCheckedChange={(checked) => {
																				return checked
																					? field.onChange([...field.value, perm.id])
																					: field.onChange(
																							field.value?.filter(
																								(value) => value !== perm.id
																							)
																					  );
																			}}
																		/>
																	</FormControl>
																	<div className="space-y-1 leading-none">
																		<FormLabel className="font-medium">
																			{perm.action}
																		</FormLabel>
																		<FormDescription>
																			{perm.description}
																		</FormDescription>
																	</div>
																</FormItem>
															);
														}}
													/>
												))}
											</div>
										</AccordionContent>
									</AccordionItem>
								))}
							</Accordion>
						</div>

						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={() => onOpenChange(false)}
								disabled={isPending}
							>
								Cancel
							</Button>
							<Button type="submit" disabled={isPending}>
								{isPending
									? isEditing
										? "Updating..."
										: "Creating..."
									: isEditing
									? "Update Role"
									: "Create Role"}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
