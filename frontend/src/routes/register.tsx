import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import {
	Mail as MailIcon,
	Lock as LockIcon,
	Loader2,
	Info,
} from "lucide-react";
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

export const Route = createFileRoute("/register")({
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
	component: RegisterPage,
});

function RegisterPage() {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [passwordError, setPasswordError] = useState<string | null>(null);

	const navigate = useNavigate();

	const validatePassword = (pwd: string): string | null => {
		if (pwd.length < 8) {
			return "Password must be at least 8 characters long";
		}
		if (!/[A-Z]/.test(pwd)) {
			return "Password must contain at least one uppercase letter";
		}
		if (!/[a-z]/.test(pwd)) {
			return "Password must contain at least one lowercase letter";
		}
		if (!/[0-9]/.test(pwd)) {
			return "Password must contain at least one number";
		}
		return null;
	};

	const handlePasswordChange = (value: string) => {
		setPassword(value);
		setPasswordError(validatePassword(value));
	};

	const handleEmailRegister = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsLoading(true);
		setError(null);
		setPasswordError(null);

		try {
			// Client-side validation
			if (password !== confirmPassword) {
				setPasswordError("Passwords do not match");
				setIsLoading(false);
				return;
			}

			const pwdError = validatePassword(password);
			if (pwdError) {
				setPasswordError(pwdError);
				setIsLoading(false);
				return;
			}

			const { error } = await authClient.signUp.email({
				email,
				password,
				name: email.split("@")[0],
				callbackURL: `${FRONTEND_URL}/onboarding`,
			});

			if (error) {
				setError(error.message || "Failed to register");
			} else {
				// Registration successful - navigate to onboarding for profile creation
				navigate({ to: "/onboarding" });
			}
		} catch (err: any) {
			setError("An unexpected error occurred during registration");
		} finally {
			setIsLoading(false);
		}
	};

	const handleSocialRegister = async (
		provider: "google" | "github" | "discord",
	) => {
		setIsLoading(true);
		setError(null);
		try {
			await authClient.signIn.social({
				provider,
				callbackURL: `${FRONTEND_URL}/onboarding`,
			});
		} catch (err: any) {
			setError(`Failed to register with ${provider}`);
			setIsLoading(false);
		}
	};

	return (
		<div className="flex items-center justify-center min-h-screen bg-slate-50/50 dark:bg-slate-950/50 p-4 relative">
			<div className="absolute top-4 right-4">
				{/* Mode toggle is handled by the login page pattern */}
			</div>

			<Card className="w-full max-w-md shadow-xl border-t-4 border-t-primary animate-in fade-in zoom-in duration-300">
				<CardHeader className="space-y-1 text-center">
					<CardTitle className="text-3xl font-bold tracking-tight">
						Create Account
					</CardTitle>
					<CardDescription>
						Enter your details to get started with K8s Dashboard
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-6">
					<div className="flex items-start gap-2.5">
						<Info className="h-4 w-4 text-amber-600 dark:text-amber-500 mt-0.5 flex-shrink-0" />
						<h1 className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed font-semibold">
							This is the really important note please read all of this before
							perform any login action
						</h1>
						<p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
							<span className="font-semibold">
								Third-party cookies required.
							</span>{" "}
							Some browsers block cookies from external login providers by
							default. If your login fails, try allowing third-party cookies in
							your browser settings, or use incognito/private mode.
							{/* Make the text below as attract as posiable because this is the really important note */}
							<p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
								<span className="font-semibold">
									The personal mode or guest mode in chrome also prevent the
									login flow can work correctly so please using normal browser.
									Any action to prevent cookies from cross-domain will lead to
									this issues.
                  Also the security setting in your browser that prevent cross-site tracking will also cause this issue so please make sure to disable that if you encounter any login issues.
								</span>
							</p>
						</p>
					</div>
					<div className="grid grid-cols-3 gap-3">
						<Button
							variant="outline"
							onClick={() => handleSocialRegister("github")}
							disabled={isLoading}
							className="hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-200"
						>
							<svg
								className="mr-2 h-4 w-4"
								aria-hidden="true"
								focusable="false"
								data-prefix="fab"
								data-icon="github"
								role="img"
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 496 512"
							>
								<path
									fill="currentColor"
									d="M165.9 397.4c0 2-2.3 3.6-5.2 3.6-3.3.3-5.6-1.3-5.6-3.6 0-2 2.3-3.6 5.2-3.6 3-.3 5.6 1.3 5.6 3.6zm-31.1-4.5c-.7 2 1.3 4.3 4.3 4.9 2.6 1 5.6 0 6.2-2s-1.3-4.3-4.3-5.2c-2.6-.7-5.5.3-6.2 2.3zm44.2-1.7c-2.9.7-4.9 2.6-4.6 4.9.3 2 2.9 3.3 5.9 2.6 2.9-.7 4.9-2.6 4.6-4.6-.3-1.9-3-3.2-5.9-2.9zM244.8 8C106.1 8 0 113.3 0 252c0 110.9 69.8 205.8 169.5 239.2 12.8 2.3 17.3-5.6 17.3-12.1 0-6.2-.3-40.4-.3-61.4 0 0-70 15-84.7-29.8 0 0-11.4-29.1-27.8-36.6 0 0-22.9-15.7 1.6-15.4 0 0 24.9 2 38.6 25.8 21.9 38.6 58.6 27.5 72.9 20.9 2.3-16 8.8-27.1 16-33.7-55.9-6.2-112.3-14.3-112.3-110.5 0-27.5 7.6-41.3 23.6-58.9-2.6-6.5-11.1-33.3 2.6-67.9 20.9-6.5 69 27 69 27 20-5.6 41.5-8.5 62.8-8.5s42.8 2.9 62.8 8.5c0 0 48.1-33.6 69-27 13.7 34.7 5.2 61.4 2.6 67.9 16 17.7 25.8 31.5 25.8 58.9 0 96.5-58.9 104.2-114.8 110.5 9.2 7.9 17 22.9 17 46.4 0 33.7-.3 75.4-.3 83.6 0 6.5 4.6 14.4 17.3 12.1C428.2 457.8 496 362.9 496 252 496 113.3 383.5 8 244.8 8zM97.2 352.9c-1.3 1-1 3.3.7 5.2 1.6 1.6 3.9 2.3 5.2 1 1.3-1 1-3.3-.7-5.2-1.6-1.6-3.9-2.3-5.2-1zm-10.8-8.1c-.7 1.3.3 2.9 2.3 3.9 1.6 1 3.6.7 4.3-.7.7-1.3-.3-2.9-2.3-3.9-2-.6-3.6-.3-4.3.7zm32.4 35.6c-1.6 1.3-1 4.3 1.3 6.2 2.3 2.3 5.2 2.6 6.5 1 1.3-1.3.7-4.3-1.3-6.2-2.2-2.3-5.2-2.6-6.5-1zm-11.4-14.7c-1.6 1-1.6 3.6 0 5.9 1.6 2.3 4.3 3.3 5.6 2.3 1.6-1.3 1.6-3.9 0-6.2-1.4-2.3-4-3.3-5.6-2z"
								/>
							</svg>
							Github
						</Button>
						<Button
							variant="outline"
							onClick={() => handleSocialRegister("google")}
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
								/>
							</svg>
							Google
						</Button>
						<Button
							variant="outline"
							onClick={() => handleSocialRegister("discord")}
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
								/>
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
								Or create an account with email
							</span>
						</div>
					</div>
					<form onSubmit={handleEmailRegister} className="grid gap-4">
						<div className="grid gap-2">
							<Label htmlFor="email">Email</Label>
							<div className="relative">
								<MailIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
								<Input
									id="email"
									type="email"
									placeholder="your@email.com"
									className="pl-10"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									required
									disabled={isLoading}
								/>
							</div>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="password">Password</Label>
							<div className="relative">
								<LockIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
								<Input
									id="password"
									type="password"
									placeholder="At least 8 characters"
									className="pl-10"
									value={password}
									onChange={(e) => handlePasswordChange(e.target.value)}
									required
									disabled={isLoading}
								/>
							</div>
							{passwordError && (
								<p className="text-sm text-destructive">{passwordError}</p>
							)}
							<p className="text-xs text-muted-foreground">
								Must contain uppercase, lowercase, and number
							</p>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="confirmPassword">Confirm Password</Label>
							<div className="relative">
								<LockIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
								<Input
									id="confirmPassword"
									type="password"
									placeholder="Re-enter your password"
									className="pl-10"
									value={confirmPassword}
									onChange={(e) => setConfirmPassword(e.target.value)}
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
						<Button
							type="submit"
							className="w-full"
							disabled={isLoading || !!passwordError}
						>
							{isLoading ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Creating account...
								</>
							) : (
								"Create Account"
							)}
						</Button>
					</form>
				</CardContent>
				<CardFooter className="flex flex-wrap items-center justify-center gap-2 border-t p-6">
					<div className="text-sm text-muted-foreground">
						Already have an account?
					</div>
					<Button
						variant="link"
						onClick={() => navigate({ to: "/login" })}
						className="p-0 h-auto font-semibold"
					>
						Sign In
					</Button>
				</CardFooter>
			</Card>
		</div>
	);
}
