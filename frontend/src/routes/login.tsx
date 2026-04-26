import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import {
	Github,
	Info,
	Loader2,
	Lock as LockIcon,
	Mail as MailIcon,
} from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { ModeToggle } from "@/components/mode-toggle";
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
import { Separator } from "@/components/ui/separator";
import { authClient } from "@/lib/auth";
import { FRONTEND_URL } from "../constants";

export const Route = createFileRoute("/login")({
	validateSearch: z.object({
		redirect: z.string().optional(),
	}),
	beforeLoad: async () => {
		const session = await authClient.getSession();
		if (session.data) {
			throw redirect({
				to: "/dashboard",
			});
		}
	},
	component: LoginPage,
});

function LoginPage() {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const navigate = useNavigate();

	const handleEmailLogin = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsLoading(true);
		setError(null);

		try {
			const { error } = await authClient.signIn.email({
				email,
				password,
			});

			if (error) {
				setError(error.message || "Failed to login");
			} else {
				navigate({ to: "/dashboard" });
			}
		} catch (err: any) {
			setError("An unexpected error occurred");
		} finally {
			setIsLoading(false);
		}
	};

	const handleSocialLogin = async (
		provider: "google" | "github" | "discord",
	) => {
		setIsLoading(true);
		setError(null);
		try {
			await authClient.signIn.social({
				provider,
				callbackURL: `${FRONTEND_URL}/dashboard`,
			});
		} catch (err: any) {
			setError(`Failed to login with ${provider}`);
			setIsLoading(false);
		}
	};

	return (
		<div className="flex items-center justify-center min-h-screen bg-slate-50/50 dark:bg-slate-950/50 p-4 relative">
			<div className="absolute top-4 right-4">
				<ModeToggle />
			</div>
			<Card className="w-full max-w-md shadow-xl border-t-4 border-t-primary animate-in fade-in zoom-in duration-300">
				<CardHeader className="space-y-1 text-center">
					<CardTitle className="text-3xl font-bold tracking-tight">
						Welcome back
					</CardTitle>
					<CardDescription>
						Enter your credentials to access the dashboard
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-6">
					<div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 animate-in slide-in-from-top-1 duration-300">
						<div className="flex items-start gap-2.5">
							<Info className="h-4 w-4 text-amber-600 dark:text-amber-500 mt-0.5 flex-shrink-0" />
							<h1 className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed font-semibold">This is the really important note please read all of this before perform any login action</h1>
							<p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
								<span className="font-semibold">
									Third-party cookies required.
								</span>{" "}
								Some browsers block cookies from external login providers by
								default. If your login fails, try allowing third-party cookies
								in your browser settings, or use incognito/private mode.

								{/* Make the text below as attract as posiable because this is the really important note */}
								<p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
									<span className="font-semibold">
										The personal mode or guest mode in chrome also prevent the login flow can work correctly so please using normal browser.
										Any action to prevent cookies from cross-domain will lead to this issues.
									</span>
								</p>
							</p>
						</div>
					</div>
					<div className="grid grid-cols-3 gap-3">
						<Button
							variant="outline"
							onClick={() => handleSocialLogin("github")}
							disabled={isLoading}
							className="hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-200"
						>
							<Github className="mr-2 h-4 w-4" />
							Github
						</Button>
						<Button
							variant="outline"
							onClick={() => handleSocialLogin("google")}
							disabled={isLoading}
							className="hover:bg-red-50 dark:hover:bg-red-900/10 transition-all duration-200 border-red-100 dark:border-red-900/20"
						>
							<svg
								className="mr-2 h-4 w-4"
								aria-hidden="true"
								focusable="false"
								data-prefix="fab"
								data-icon="google"
								role="img"
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 488 512"
							>
								<path
									fill="currentColor"
									d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"
								></path>
							</svg>
							Google
						</Button>
						<Button
							variant="outline"
							onClick={() => handleSocialLogin("discord")}
							disabled={isLoading}
							className="hover:bg-indigo-50 dark:hover:bg-indigo-900/10 transition-all duration-200 border-indigo-100 dark:border-indigo-900/20"
						>
							<svg
								className="mr-2 h-4 w-4"
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 127.14 96.36"
							>
								<title>Discord Logo</title>
								<path
									fill="currentColor"
									d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.06,72.06,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.71,32.65-1.82,56.6.48,80.1a105.73,105.73,0,0,0,32.22,16.26,77.7,77.7,0,0,0,7.12-11.53,68.9,68.9,0,0,1-11.4-5.45c.95-.7,1.89-1.43,2.79-2.2a75.75,75.75,0,0,0,64.74,0c.9,1.17,1.84,1.89,2.79,2.2a68.49,68.49,0,0,1-11.4,5.44,77.76,77.76,0,0,0,7.12,11.53,105.41,105.41,0,0,0,32.27-16.26C129.6,50.12,125.7,26.27,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5.07-12.71,11.41-12.71,11.52,5.76,11.52,12.71S48.83,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5.07-12.71,11.44-12.71,11.52,5.76,11.52,12.71S84.79,65.69,84.69,65.69Z"
								></path>
							</svg>
							Discord
						</Button>
					</div>
					<div className="relative">
						<div className="absolute inset-0 flex items-center">
							<Separator />
						</div>
						<div className="relative flex justify-center text-xs uppercase">
							<span className="bg-card px-2 text-muted-foreground">
								Or continue with email
							</span>
						</div>
					</div>
					<form onSubmit={handleEmailLogin} className="grid gap-4">
						<div className="grid gap-2">
							<Label htmlFor="email">Email</Label>
							<div className="relative">
								<MailIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
								<Input
									id="email"
									type="email"
									placeholder="m@example.com"
									className="pl-10"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									required
									disabled={isLoading}
								/>
							</div>
						</div>
						<div className="grid gap-2">
							<div className="flex items-center justify-between">
								<Label htmlFor="password">Password</Label>
							</div>
							<div className="relative">
								<LockIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
								<Input
									id="password"
									type="password"
									className="pl-10"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									required
									disabled={isLoading}
								/>
							</div>
						</div>
						{error && (
							<div className="text-sm font-medium text-destructive bg-destructive/10 p-3 rounded-md animate-in slide-in-from-top-1 duration-200">
								{error}
							</div>
						)}
						<Button type="submit" className="w-full" disabled={isLoading}>
							{isLoading ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Please wait
								</>
							) : (
								"Sign In"
							)}
						</Button>
					</form>
				</CardContent>
				<CardFooter className="flex flex-wrap items-center justify-between gap-2 border-t p-6">
					<div className="text-sm text-muted-foreground">
						Don't have an account?
					</div>
					<Button
						variant="link"
						onClick={() => navigate({ to: "/register" })}
						className="p-0 h-auto font-semibold"
					>
						Sign Up
					</Button>
				</CardFooter>
			</Card>
		</div>
	);
}
