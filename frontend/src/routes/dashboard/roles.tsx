import { createFileRoute } from "@tanstack/react-router";
import { RoleAssignments } from "@/components/roles/role-assignments";
import { RolesList } from "@/components/roles/roles-list";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePermissions } from "@/hooks/use-permissions";

export const Route = createFileRoute("/dashboard/roles")({
	component: RolesPage,
});

function RolesPage() {
	const { can, isLoading: isLoadingPermissions } = usePermissions();

	if (!can("role:read") && !isLoadingPermissions) {
		return (
			<div className="flex items-center justify-center py-12">
				<div className="text-center">
					<h2 className="text-xl font-semibold text-muted-foreground">
						Access Denied
					</h2>
					<p className="text-sm text-muted-foreground mt-2">
						You don't have permission to view roles.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="p-6 space-y-6">
			<div>
				<h1 className="text-3xl font-bold tracking-tight">Access Control</h1>
				<p className="text-muted-foreground">
					Manage role-based access control and user assignments.
				</p>
			</div>

			<Tabs defaultValue="roles" className="space-y-4">
				<TabsList>
					<TabsTrigger value="roles">Role Definitions</TabsTrigger>
					<TabsTrigger value="assignments">User Assignments</TabsTrigger>
				</TabsList>

				<TabsContent value="roles" className="space-y-4">
					<Card>
						<CardHeader>
							<CardTitle>Roles</CardTitle>
							<CardDescription>
								Define roles and their associated system permissions.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<RolesList />
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="assignments" className="space-y-4">
					<Card>
						<CardHeader>
							<CardTitle>User Role Assignments</CardTitle>
							<CardDescription>
								Assign specific roles to users across the platform.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<RoleAssignments />
						</CardContent>
					</Card>
				</TabsContent>
			</Tabs>
		</div>
	);
}
