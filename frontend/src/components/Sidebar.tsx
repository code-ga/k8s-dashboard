import { Link, useLocation } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Settings, Users, Server } from "lucide-react";
import { hasPermission, type Role } from "@/config/permissions";
import { Separator } from "@/components/ui/separator";

interface SidebarProps {
	role: Role;
	className?: string;
}

export function Sidebar({ role, className }: SidebarProps) {
	const { pathname } = useLocation();

	const links = [
		{
			to: "/dashboard",
			label: "Clusters",
			icon: Server,
			resource: "cluster",
			action: "view",
			exact: true,
		},
		{
			to: "/dashboard/users",
			label: "Users",
			icon: Users,
			resource: "users",
			action: "view",
			exact: false,
		},
		{
			to: "/dashboard/settings",
			label: "Settings",
			icon: Settings,
			resource: "settings",
			action: "view",
			exact: false,
		},
	] as const;

	return (
		<div
			className={cn("flex flex-col h-full bg-card border-r w-64", className)}
		>
			<div className="p-6">
				<h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
					<LayoutDashboard className="w-6 h-6" />
					K8s Dashboard
				</h2>
			</div>
			<Separator />
			<div className="flex-1 py-4">
				<nav className="grid items-start px-2 text-sm font-medium lg:px-4 space-y-1">
					{links.map((link) => {
						if (
							!hasPermission(role, link.resource as any, link.action as any)
						) {
							return null;
						}

						const Icon = link.icon;
						const isActive = link.exact
							? pathname === link.to
							: pathname.startsWith(link.to);

						return (
							<Link
								key={link.to}
								to={link.to as any}
								className={cn(
									"flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:text-primary",
									isActive ? "bg-muted text-primary" : "text-muted-foreground",
								)}
							>
								<Icon className="h-4 w-4" />
								{link.label}
							</Link>
						);
					})}
				</nav>
			</div>
		</div>
	);
}
