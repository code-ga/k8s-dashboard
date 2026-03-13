import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Shield, Check, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/use-permissions";

export const Route = createFileRoute("/dashboard/roles")({
	component: RolesPage,
});

function RolesPage() {
	const queryClient = useQueryClient();
	const { can } = usePermissions();

	const { data: roles, isLoading } = useQuery({
		queryKey: ["roles"],
		queryFn: async () => {
			const res = await api.api.role.get();
			if (res.error) {
				const errorValue = res.error.value;
				const message =
					typeof errorValue === "object" && errorValue !== null && "message" in errorValue
						? (errorValue as { message: string }).message
						: String(errorValue);
				throw new Error(message);
			}
			return res.data.data;
		},
	});

	const setDefaultMutation = useMutation({
		mutationFn: async (id: number | string) => {
			const res = await api.api.role({ id: String(id) })["set-default"].patch({
				isDefault: true,
			});
			if (res.error) throw new Error(String(res.error.value));
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

	if (isLoading) return <div>Loading roles...</div>;

	return (
		<div className="p-6 space-y-6">
			<div className="flex justify-between items-center">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">Role Management</h1>
					<p className="text-muted-foreground">
						Manage access control roles and permissions.
					</p>
				</div>
				{can("role:create") && (
					<Button className="gap-2">
						<Plus className="w-4 h-4" />
						Create Role
					</Button>
				)}
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Available Roles</CardTitle>
					<CardDescription>
						Roles defined in the system and their associated permissions.
					</CardDescription>
				</CardHeader>
				<CardContent>
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
							{roles?.map((role) => (
								<TableRow key={role.id}>
									<TableCell className="font-medium flex items-center gap-2">
										<Shield className="w-4 h-4 text-primary" />
										{role.name}
									</TableCell>
									<TableCell>{role.description}</TableCell>
									<TableCell>
										<div className="flex flex-wrap gap-1">
											{role.permissions.slice(0, 5).map((p) => (
												<Badge key={p} variant="secondary" className="text-[10px]">
													{p}
												</Badge>
											))}
											{role.permissions.length > 5 && (
												<Badge variant="outline" className="text-[10px]">
													+{role.permissions.length - 5} more
												</Badge>
											)}
										</div>
									</TableCell>
									<TableCell>
										{role.isDefault ? (
											<Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20 border-green-500/20">
												<Check className="w-3 h-3 mr-1" />
												Default
											</Badge>
										) : (
											can("role:manage") && (
												<Button
													variant="ghost"
													size="sm"
													onClick={() => setDefaultMutation.mutate(role.id)}
												>
													Set Default
												</Button>
											)
										)}
									</TableCell>
									<TableCell className="text-right">
										<div className="flex justify-end gap-2">
											{can("role:manage") && (
												<Button variant="ghost" size="icon">
													<Plus className="w-4 h-4" />
												</Button>
											)}
											{can("role:delete") && !role.isDefault && (
												<Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10">
													<Trash2 className="w-4 h-4" />
												</Button>
											)}
										</div>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
		</div>
	);
}
