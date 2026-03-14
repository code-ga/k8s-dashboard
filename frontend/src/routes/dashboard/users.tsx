import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api, getEdenErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/use-permissions";
import { RoleBadge } from "@/components/RoleBadge";

export const Route = createFileRoute("/dashboard/users")({
	component: UserManagement,
});

interface UserProfile {
	userId: string;
	username: string;
	rolesIDs: string[];
}

function UserManagement() {
	const queryClient = useQueryClient();
	const { can } = usePermissions();

	const { data: users, isLoading } = useQuery({
		queryKey: ["users"],
		queryFn: async () => {
			const res = await api.api.profile["list-user"].get();
			if (res.error) {
				throw new Error(getEdenErrorMessage(res.error));
			}
			return res.data.data;
		},
	});

	// Fetch available roles
	const { data: availableRoles } = useQuery({
		queryKey: ["available-roles"],
		queryFn: async () => {
			const res = await api.api.role.get();
			if (res.error) {
				throw new Error(getEdenErrorMessage(res.error));
			}
			return res.data.data;
		},
	});

	const addRoleMutation = useMutation({
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
			queryClient.invalidateQueries({ queryKey: ["users"] });
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
			queryClient.invalidateQueries({ queryKey: ["users"] });
			toast.success("Role removed successfully");
		},
		onError: (err) => {
			toast.error(err.message);
		},
	});

	if (isLoading) return <div>Loading users...</div>;

	return (
		<div className="space-y-6 p-6">
			<div>
				<h2 className="text-3xl font-bold tracking-tight">User Management</h2>
				<p className="text-muted-foreground">
					Manage user permissions by assigning roles.
				</p>
			</div>

			<div className="grid gap-4">
				{users?.map((user: UserProfile) => (
					<Card key={user.userId}>
						<CardHeader className="pb-2">
							<CardTitle>{user.username}</CardTitle>
							<CardDescription>ID: {user.userId}</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="flex flex-wrap gap-2 items-center">
								<span className="text-sm font-medium mr-2">Assigned Roles:</span>
								{user.rolesIDs.map((roleId: string) => (
									<RoleBadge
										key={roleId}
										roleId={roleId}
										className="bg-secondary rounded-full px-3 py-1 text-xs"
									>
										{can("user:manage") && (
											<button
												type="button"
												onClick={() =>
													removeRoleMutation.mutate({
														userId: user.userId,
														roleId: roleId,
													})
												}
												className="text-muted-foreground hover:text-destructive transition-colors ml-1"
												aria-label={`Remove role ${roleId}`}
											>
												&times;
											</button>
										)}
									</RoleBadge>
								))}

								{can("user:manage") && (
									<Select
										onValueChange={(val) =>
											addRoleMutation.mutate({
												userId: user.userId,
												roleId: val,
											})
										}
									>
										<SelectTrigger className="w-[130px] h-7 text-xs rounded-full">
											<SelectValue placeholder="Add role" />
										</SelectTrigger>
										<SelectContent>
											{availableRoles?.map((role) => (
												<SelectItem key={role.id} value={role.id}>
													{role.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								)}
							</div>
						</CardContent>
					</Card>
				))}
			</div>
		</div>
	);
}
