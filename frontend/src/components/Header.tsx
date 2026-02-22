import { useQuery } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { BreadcrumbNav } from "./shared/breadcrumb-nav";
import { ClusterSwitcher } from "./shared/cluster-switcher";
import { ModeToggle } from "./mode-toggle";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth";

export default function Header() {
	const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
	const { pathname } = useLocation();

	const { data: session } = authClient.useSession();
	const { data: profile } = useQuery({
		queryKey: ["profile", session?.user?.id],
		queryFn: async () => {
			const res = await api.api.profile.me.get();
			if (res.error) throw res.error;
			return res.data.data;
		},
		enabled: !!session?.user?.id,
	});

	// Close mobile menu when route changes
	useEffect(() => {
		setIsMobileMenuOpen(false);
	}, [pathname]);

	const role = (profile?.permission?.[0] as any) || "viewer";

	return (
		<>
			<header className="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b bg-card/80 backdrop-blur-md px-4 sm:px-6 shadow-xs">
				<div className="flex items-center gap-4">
					<button
						type="button"
						onClick={() => setIsMobileMenuOpen(true)}
						className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden transition-colors"
						aria-label="Open menu"
					>
						<Menu className="h-6 w-6" />
					</button>

					<div className="hidden lg:block">
						<BreadcrumbNav />
					</div>
				</div>

				<div className="flex items-center gap-2 sm:gap-4">
					<div className="hidden sm:block">
						<ClusterSwitcher />
					</div>
					<div className="h-8 w-[1px] bg-border mx-1 hidden sm:block" />
					<ModeToggle />
				</div>
			</header>

			{/* Mobile Sidebar Overlay */}
			{isMobileMenuOpen && (
				<div
					className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm lg:hidden transition-all duration-300"
					onClick={() => setIsMobileMenuOpen(false)}
				/>
			)}

			{/* Mobile Sidebar */}
			<aside
				className={`fixed inset-y-0 left-0 z-50 w-72 bg-card transform transition-transform duration-300 ease-in-out lg:hidden flex flex-col shadow-2xl ${
					isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
				}`}
			>
				<div className="flex items-center justify-between p-4 border-b">
					<span className="text-lg font-bold text-primary">Navigation</span>
					<button
						type="button"
						onClick={() => setIsMobileMenuOpen(false)}
						className="p-2 hover:bg-accent rounded-lg transition-colors text-muted-foreground hover:text-foreground"
						aria-label="Close menu"
					>
						<X className="h-6 w-6" />
					</button>
				</div>
				<Sidebar role={role} className="w-full border-r-0" />
			</aside>

			{/* Mobile Context Info (Breadcrumbs/Switcher) */}
			<div className="lg:hidden flex items-center justify-between bg-muted/50 px-4 py-2 border-b gap-2">
				<div className="flex-1 min-w-0">
					<BreadcrumbNav />
				</div>
				<div className="shrink-0 sm:hidden">
					<ClusterSwitcher />
				</div>
			</div>
		</>
	);
}
