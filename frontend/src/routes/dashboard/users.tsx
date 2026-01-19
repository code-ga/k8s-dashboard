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
import { api, type databaseTypes } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Static } from "elysia";

export const Route = createFileRoute("/dashboard/users")({
	component: UserManagement,
});

function UserManagement() {
	const queryClient = useQueryClient();
	const { data: users, isLoading } = useQuery({
		queryKey: ["users"],
		queryFn: async () => {
			const res = await api.api.profile["list-user"].get();
			if (res.error) throw res.error;
			if (!res.data.data)
				throw new Error(res.data.message || "Failed to fetch users");
			return res.data.data;
		},
	});

	// Fetch available roles
	const { data: availableRoles } = useQuery({
		queryKey: ["roles"],
		queryFn: async () => {
			const res = await api.api.profile["available-role"].get();
			if (res.error) throw res.error;
			if (!res.data.data)
				throw new Error(res.data.message || "Failed to fetch roles");
			return res.data.data;
		},
	});

	const addRoleMutation = useMutation({
		mutationFn: async ({
			userId,
			permission,
		}: {
			userId: string;
			permission: Static<
				databaseTypes.databaseTypes["profile"]["permission"]
			>[number];
		}) => {
			const res = await api.api.profile.add_role.patch({
				userId,
				permission: [permission],
			});
			if (res.error) throw res.error;
			return res.data;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["users"] });
		},
		onError: (err) => {
			alert("Failed to add role");
			console.error(err);
		},
	});

	const removeRoleMutation = useMutation({
		mutationFn: async ({
			userId,
			permission,
		}: {
			userId: string;
			permission: Static<
				databaseTypes.databaseTypes["profile"]["permission"]
			>[number];
		}) => {
			const res = await api.api.profile.remove_role.patch({
				userId,
				permission: [permission],
			});
			if (res.error) throw res.error;
			return res.data;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["users"] });
		},
		onError: (err) => {
			alert("Failed to remove role");
			console.error(err);
		},
	});

	if (isLoading) return <div>Loading users...</div>;

	return (
		<div className="space-y-6">
			<div>
				<h2 className="text-3xl font-bold tracking-tight">User Management</h2>
				<p className="text-muted-foreground">
					Manage user roles and permissions.
				</p>
			</div>

			<div className="grid gap-4">
				{users?.map((user) => (
					<Card key={user.userId}>
						<CardHeader className="pb-2">
							<CardTitle>{user.username}</CardTitle>
							<CardDescription>ID: {user.userId}</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="flex flex-wrap gap-2 items-center">
								<span className="text-sm font-medium mr-2">Roles:</span>
								{user.permission.map((role) => (
									<div
										key={role}
										className="flex items-center gap-1 bg-secondary rounded-full px-3 py-1 text-xs"
									>
										{role}
										{/** biome-ignore lint/a11y/useButtonType: <explanation> */}
										<button
											onClick={() =>
												removeRoleMutation.mutate({
													userId: user.userId,
													permission: role,
												})
											}
											className="text-muted-foreground hover:text-destructive transition-colors ml-1"
											aria-label={`Remove ${role} role`}
										>
											&times;
										</button>
									</div>
								))}

								<Select
									onValueChange={(val) =>
										addRoleMutation.mutate({
											userId: user.userId,
											permission: val as Static<
												databaseTypes.databaseTypes["profile"]["permission"]
											>[number],
										})
									}
								>
									<SelectTrigger className="w-[130px] h-7 text-xs rounded-full">
										<SelectValue placeholder="Add role" />
									</SelectTrigger>
									<SelectContent>
										{availableRoles?.map((role) => (
											<SelectItem key={role} value={role}>
												{role}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</CardContent>
					</Card>
				))}
			</div>
		</div>
	);
}
