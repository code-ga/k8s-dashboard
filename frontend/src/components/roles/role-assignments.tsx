import { Badge } from "@/components/ui/badge";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { usePermissions } from "@/hooks/use-permissions";
import { api, getEdenErrorMessage } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { User, X } from "lucide-react";
import { toast } from "sonner";

type RoleWithSelection = {
	userId: string;
	username: string;
	rolesIDs: string[];
};

export function RoleAssignments() {
	const queryClient = useQueryClient();
	const { can } = usePermissions();

	const { data: users, isLoading: isLoadingUsers } = useQuery({
		queryKey: ["users-with-roles"],
		queryFn: async () => {
			const res = await api.api.profile["list-user"].get();
			if (res.error) throw new Error(getEdenErrorMessage(res.error));
			return res.data.data;
		},
	});

	const { data: availableRoles, isLoading: isLoadingRoles } = useQuery({
		queryKey: ["available-roles"],
		queryFn: async () => {
			const res = await api.api.role.available.get();
			if (res.error) throw new Error(getEdenErrorMessage(res.error));
			return res.data.data;
		},
	});

	const assignRoleMutation = useMutation({
		mutationFn: async ({
			userId,
			roleId,
		}: {
			userId: string;
			roleId: string;
		}) => {
			const res = await api.api.role["assign-to-user"].patch({
				userId,
				roleIds: [roleId],
			});
			if (res.error) throw new Error(getEdenErrorMessage(res.error));
			return res.data;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["users-with-roles"] });
			toast.success("Role assigned successfully");
		},
		onError: (err) => {
			toast.error(err.message);
		},
	});

	const removeRoleMutation = useMutation({
		mutationFn: async ({
			userId,
			roleId,
		}: {
			userId: string;
			roleId: string;
		}) => {
			const res = await api.api.role["remove-from-user"].patch({
				userId,
				roleIds: [roleId],
			});
			if (res.error) throw new Error(getEdenErrorMessage(res.error));
			return res.data;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["users-with-roles"] });
			toast.success("Role removed successfully");
		},
		onError: (err) => {
			toast.error(err.message);
		},
	});

	if (isLoadingUsers || isLoadingRoles)
		return <div className="p-4">Loading assignments...</div>;

	const canManage = can("user:manage");

	return (
		<div className="rounded-md border">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>User</TableHead>
						<TableHead>Email / ID</TableHead>
						<TableHead>Assigned Roles</TableHead>
						{canManage && <TableHead className="w-[200px]">Add Role</TableHead>}
					</TableRow>
				</TableHeader>
				<TableBody>
					{users?.map((user: RoleWithSelection) => (
						<TableRow key={user.userId}>
							<TableCell>
								<div className="flex items-center gap-2">
									<User className="w-4 h-4 text-muted-foreground" />
									<span className="font-medium">{user.username}</span>
								</div>
							</TableCell>
							<TableCell>
								<span className="text-xs text-muted-foreground uppercase">
									{user.userId}
								</span>
							</TableCell>
							<TableCell>
								<div className="flex flex-wrap gap-2">
									{user.rolesIDs?.map((roleId: string) => {
										const roleName =
											availableRoles?.find((r) => r.id === roleId)?.name ||
											roleId;
										return (
											<Badge
												key={roleId}
												variant="secondary"
												className="flex items-center gap-1 pr-1"
											>
												{roleName}
												{canManage && (
													<button
														type="button"
														onClick={() =>
															removeRoleMutation.mutate({
																userId: user.userId,
																roleId,
															})
														}
														className="hover:bg-destructive hover:text-destructive-foreground rounded-full p-0.5 transition-colors"
													>
														<X className="w-3 h-3" />
													</button>
												)}
											</Badge>
										);
									})}
									{(!user.rolesIDs || user.rolesIDs.length === 0) && (
										<span className="text-xs text-muted-foreground italic">
											No roles assigned
										</span>
									)}
								</div>
							</TableCell>
							{canManage && (
								<TableCell>
									<Select
										onValueChange={(roleId) =>
											assignRoleMutation.mutate({
												userId: user.userId,
												roleId,
											})
										}
									>
										<SelectTrigger className="h-8 text-xs">
											<SelectValue placeholder="Assign role..." />
										</SelectTrigger>
										<SelectContent>
											{availableRoles
												?.filter((r) => !user.rolesIDs?.includes(r.id))
												.map((role) => (
													<SelectItem key={role.id} value={String(role.id)}>
														{role.name}
													</SelectItem>
												))}
										</SelectContent>
									</Select>
								</TableCell>
							)}
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
