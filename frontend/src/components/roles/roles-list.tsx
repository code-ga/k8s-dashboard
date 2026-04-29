import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, getEdenErrorMessage, type SchemaType } from "@/lib/api";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, Edit, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/use-permissions";
import { useState } from "react";
import { RoleDialog } from "./role-dialog";
import { Switch } from "@/components/ui/switch";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";

type Role = SchemaType["role"];

export function RolesList() {
	const queryClient = useQueryClient();
	const { can } = usePermissions();
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [selectedRole, setSelectedRole] = useState<Role | null>(null);

	const { data: roles, isLoading } = useQuery({
		queryKey: ["roles"],
		queryFn: async () => {
			const res = await api.api.role.get();
			if (res.error) throw new Error(getEdenErrorMessage(res.error));
			return res.data.data;
		},
	});

	const setDefaultMutation = useMutation({
		mutationFn: async ({
			id,
			isDefault,
		}: {
			id: string;
			isDefault: boolean;
		}) => {
			const res = await api.api.role({ id })["set-default"].patch({
				isDefault,
			});
			if (res.error) throw new Error(getEdenErrorMessage(res.error));
			return res.data;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["roles"] });
			toast.success("Default role updated");
		},
		onError: (err) => {
			toast.error(err.message);
		},
	});

	const deleteMutation = useMutation({
		mutationFn: async (id: string) => {
			const res = await api.api.role({ id }).delete();
			if (res.error) throw new Error(getEdenErrorMessage(res.error));
			return res.data;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["roles"] });
			toast.success("Role deleted successfully");
		},
		onError: (err) => {
			toast.error(err.message);
		},
	});

	const openCreateDialog = () => {
		setSelectedRole(null);
		setIsDialogOpen(true);
	};

	const openEditDialog = (role: Role) => {
		setSelectedRole(role);
		setIsDialogOpen(true);
	};

	const handleDelete = (id: string) => {
		if (window.confirm("Are you sure you want to delete this role?")) {
			deleteMutation.mutate(id);
		}
	};

	if (isLoading) return <div className="p-4">Loading roles...</div>;

	const defaultRolesCount = roles?.filter((r) => r.isDefault).length || 0;

	return (
		<div className="space-y-4">
			<div className="flex justify-end">
				{can("role:create") && (
					<Button className="gap-2" onClick={openCreateDialog}>
						<Plus className="w-4 h-4" />
						Create Role
					</Button>
				)}
			</div>

			<div className="rounded-md border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Name</TableHead>
							<TableHead>Description</TableHead>
							<TableHead>Permissions</TableHead>
							<TableHead>Default</TableHead>
							<TableHead className="text-right">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{roles?.map((role) => {
							const isLastDefault = role.isDefault && defaultRolesCount <= 1;
							const canUpdate = can("role:update");

							return (
								<TableRow key={role.id}>
									<TableCell className="font-medium">
										<div className="flex items-center gap-2">
											<Shield className="w-4 h-4 text-primary" />
											{role.name}
										</div>
									</TableCell>
									<TableCell className="max-w-[200px] truncate">
										{role.description}
									</TableCell>
									<TableCell>
										<div className="flex flex-wrap gap-1">
											{role.permissions.slice(0, 3).map((p) => (
												<Badge
													key={p}
													variant="secondary"
													className="text-[10px]"
												>
													{p}
												</Badge>
											))}
											{role.permissions.length > 3 && (
												<Badge variant="outline" className="text-[10px]">
													+{role.permissions.length - 3} more
												</Badge>
											)}
										</div>
									</TableCell>
									<TableCell>
										<TooltipProvider>
											<Tooltip>
												<TooltipTrigger asChild>
													<div className="flex items-center">
														<Switch
															checked={role.isDefault}
															disabled={isLastDefault || !canUpdate}
															onCheckedChange={(checked) =>
																setDefaultMutation.mutate({
																	id: String(role.id),
																	isDefault: checked,
																})
															}
														/>
													</div>
												</TooltipTrigger>
												{isLastDefault && (
													<TooltipContent>
														<p>At least one default role is required</p>
													</TooltipContent>
												)}
											</Tooltip>
										</TooltipProvider>
									</TableCell>
									<TableCell className="text-right">
										<div className="flex justify-end gap-2">
											{canUpdate && (
												<Button
													variant="ghost"
													size="icon"
													onClick={() => openEditDialog(role)}
												>
													<Edit className="w-4 h-4" />
												</Button>
											)}
											{can("role:delete") && !role.isDefault && (
												<Button
													variant="ghost"
													size="icon"
													className="text-destructive hover:text-destructive hover:bg-destructive/10"
													onClick={() => handleDelete(String(role.id))}
												>
													<Trash2 className="w-4 h-4" />
												</Button>
											)}
										</div>
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			</div>

			<RoleDialog
				open={isDialogOpen}
				onOpenChange={setIsDialogOpen}
				role={selectedRole}
			/>
		</div>
	);
}
