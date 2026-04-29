import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { RoleBadge } from "@/components/RoleBadge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth";
import { logger } from "../../../lib/logger";

export const Route = createFileRoute("/_protected/dashboard/settings")({
	component: DashboardSettings,
});

function DashboardSettings() {
	const queryClient = useQueryClient();
	const { data: session } = authClient.useSession();

	const { data: profile, isLoading } = useQuery({
		queryKey: ["profile", session?.user?.id],
		queryFn: async () => {
			const res = await api.api.profile.me.get();
			if (res.error) throw res.error;
			if (!res.data.data)
				throw new Error(res.data.message || "Failed to fetch profile");
			return res.data.data;
		},
		enabled: !!session?.user?.id,
	});

	const updateProfileMutation = useMutation({
		mutationFn: async (newUsername: string) => {
			const res = await api.api.profile.put({
				username: newUsername,
			});
			if (res.error) throw res.error;
			if (!res.data.data)
				throw new Error(res.data.message || "Failed to update profile");
			return res.data.data;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["profile"] });
			alert("Profile updated!");
		},
		onError: (err) => {
			alert("Failed to update profile");
			logger.error(err);
		},
	});

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		const formData = new FormData(e.target as HTMLFormElement);
		const newUsername = formData.get("username") as string;
		if (newUsername) {
			updateProfileMutation.mutate(newUsername);
		}
	};

	if (isLoading) return <div>Loading...</div>;
	if (!profile) return <div>No profile data</div>;

	return (
		<div className="max-w-xl">
			<Card>
				<CardHeader>
					<CardTitle>User Profile</CardTitle>
					<CardDescription>Manage your profile settings.</CardDescription>
				</CardHeader>
				<form onSubmit={handleSubmit}>
					<CardContent className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="email">Email</Label>
							<Input id="email" value={session?.user?.email} disabled />
						</div>
						<div className="space-y-2">
							<Label htmlFor="username">Username</Label>
							<Input
								id="username"
								name="username"
								defaultValue={profile?.username}
								placeholder="Enter your username"
							/>
						</div>
						<div className="space-y-2">
							<Label>Role</Label>
							<div className="flex gap-2">
								{profile?.rolesIDs.map((p) => (
									<RoleBadge key={p} roleId={p} />
								))}
							</div>
						</div>
					</CardContent>
					<CardFooter>
						<Button type="submit" disabled={updateProfileMutation.isPending}>
							{updateProfileMutation.isPending ? "Saving..." : "Save Changes"}
						</Button>
					</CardFooter>
				</form>
			</Card>
		</div>
	);
}
