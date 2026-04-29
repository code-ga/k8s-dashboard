import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
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
import { api, getEdenErrorMessage } from "@/lib/api";
import { authClient } from "@/lib/auth";
import { Loader2, UserCircle } from "lucide-react";

export const Route = createFileRoute("/_protected/onboarding")({
	component: OnboardingPage,
});

function OnboardingPage() {
	const [username, setUsername] = useState("");
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	const { data: session, isPending: isSessionLoading } =
		authClient.useSession();

	const createProfileMutation = useMutation({
		mutationFn: async (username: string) => {
			const res = await api.api.profile.post({ username });
			if (res.error) {
				throw new Error(getEdenErrorMessage(res.error));
			}
			return res.data;
		},
		onSuccess: () => {
			toast.success("Profile created! Welcome to K8s Dashboard.");
			queryClient.invalidateQueries({ queryKey: ["profile"] });
			navigate({ to: "/dashboard" });
		},
		onError: (error: Error) => {
			toast.error(error.message);
		},
	});

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!username.trim()) return;
		createProfileMutation.mutate(username);
	};

	if (isSessionLoading) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<Loader2 className="h-8 w-8 animate-spin text-primary" />
			</div>
		);
	}

	if (!session) {
		navigate({ to: "/login" });
		return null;
	}

	return (
		<div className="flex items-center justify-center min-h-screen bg-slate-50/50 dark:bg-slate-950/50 p-4">
			<Card className="w-full max-w-md shadow-xl border-t-4 border-t-primary">
				<CardHeader className="space-y-1 text-center">
					<div className="flex justify-center mb-2">
						<UserCircle className="h-12 w-12 text-primary" />
					</div>
					<CardTitle className="text-2xl font-bold tracking-tight">
						Complete your profile
					</CardTitle>
					<CardDescription>
						Choose a username to get started with K8s Dashboard
					</CardDescription>
				</CardHeader>
				<form onSubmit={handleSubmit}>
					<CardContent className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="username">Username</Label>
							<Input
								id="username"
								placeholder="johndoe"
								value={username}
								onChange={(e) => setUsername(e.target.value)}
								required
								autoFocus
								disabled={createProfileMutation.isPending}
							/>
							<p className="text-xs text-muted-foreground">
								This is how you'll be identified in the system.
							</p>
						</div>
					</CardContent>
					<CardFooter>
						<Button
							type="submit"
							className="w-full"
							disabled={createProfileMutation.isPending || !username.trim()}
						>
							{createProfileMutation.isPending ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Creating profile...
								</>
							) : (
								"Finish Setup"
							)}
						</Button>
					</CardFooter>
				</form>
			</Card>
		</div>
	);
}
