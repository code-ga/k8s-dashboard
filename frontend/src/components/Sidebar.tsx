import { Link, useLocation, useParams } from "@tanstack/react-router";
import {
	Box,
	ChevronLeft,
	Cpu,
	Database,
	FileJson,
	LayoutDashboard,
	Layers,
	Lock,
	Network,
	Server,
	Settings,
	Shield,
	Users,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";
import type { PermissionFilter } from "@/lib/permission-matcher";

interface SidebarProps {
	role: string;
	className?: string;
}

export function Sidebar({ role, className }: SidebarProps) {
	const { pathname } = useLocation();
	const { id: clusterId } = useParams({ strict: false }) as { id?: string };
	const { can } = usePermissions();

	const isInCluster =
		pathname.includes(`/dashboard/cluster/${clusterId}`) && clusterId;

	const globalLinks = [
		{
			to: "/dashboard",
			label: "Clusters",
			icon: Server,
			permission: "cluster:read" as PermissionFilter,
			exact: true,
		},
		{
			to: "/dashboard/users",
			label: "Users",
			icon: Users,
			permission: "user:read" as PermissionFilter,
			exact: false,
		},
		{
			to: "/dashboard/settings",
			label: "Settings",
			icon: Settings,
			permission: "cluster:manage" as PermissionFilter, // Adjusted example
			exact: false,
		},
		{
			to: "/dashboard/roles",
			label: "Roles",
			icon: Shield,
			permission: "role:read" as PermissionFilter,
			exact: false,
		}
	];

	const clusterLinks = [
		{
			to: `/dashboard/cluster/${clusterId}`,
			label: "Overview",
			icon: LayoutDashboard,
			permission: "cluster:read" as PermissionFilter,
			exact: true,
		},
		{
			to: `/dashboard/cluster/${clusterId}/nodes`,
			label: "Nodes",
			icon: Cpu,
			permission: "node:read" as PermissionFilter,
			exact: false,
		},
		{
			to: `/dashboard/cluster/${clusterId}/pods`,
			label: "Pods",
			icon: Box,
			permission: "pod:read" as PermissionFilter,
			exact: false,
		},
		{
			to: `/dashboard/cluster/${clusterId}/deployments`,
			label: "Deployments",
			icon: Layers,
			permission: "deployment:read" as PermissionFilter,
			exact: false,
		},
		{
			to: `/dashboard/cluster/${clusterId}/services`,
			label: "Services",
			icon: Network,
			permission: "service:read" as PermissionFilter,
			exact: false,
		},
		{
			to: `/dashboard/cluster/${clusterId}/ingresses`,
			label: "Ingresses",
			icon: Shield,
			permission: "ingress:read" as PermissionFilter,
			exact: false,
		},
		{
			to: `/dashboard/cluster/${clusterId}/configmaps`,
			label: "ConfigMaps",
			icon: FileJson,
			permission: "configmap:read" as PermissionFilter,
			exact: false,
		},
		{
			to: `/dashboard/cluster/${clusterId}/secrets`,
			label: "Secrets",
			icon: Lock,
			permission: "secret:read" as PermissionFilter,
			exact: false,
		},
	];

	const links = isInCluster ? clusterLinks : globalLinks;

	return (
		<div
			className={cn(
				"flex flex-col h-full bg-card border-r w-64 shrink-0",
				className,
			)}
		>
			<div className="p-6">
				<h2 className="text-xl font-bold tracking-tight flex items-center gap-2 text-primary">
					<Database className="w-6 h-6" />
					The-bridge
				</h2>
				<p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-widest font-semibold">
					{isInCluster ? "Cluster Management" : "Global Dashboard"}
				</p>
			</div>

			<Separator className="opacity-50" />

			<div className="flex-1 py-4 overflow-y-auto">
				{isInCluster && (
					<div className="px-4 mb-4">
						<Link
							to="/dashboard"
							className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors group"
						>
							<ChevronLeft className="h-3 w-3 group-hover:-translate-x-0.5 transition-transform" />
							Back to Clusters
						</Link>
					</div>
				)}

				<nav className="grid items-start px-2 text-sm font-medium lg:px-4 space-y-1">
					{links.map((link) => {
						if (!can(link.permission)) {
							return null;
						}

						const Icon = link.icon;
						const isActive = link.exact
							? pathname === link.to
							: pathname.startsWith(link.to);

						return (
							<Link
								key={link.to}
								to={link.to}
								className={cn(
									"flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-200 group",
									isActive
										? "bg-primary/10 text-primary font-bold shadow-xs whitespace-nowrap"
										: "text-muted-foreground hover:text-foreground hover:bg-accent/50",
								)}
							>
								<Icon
									className={cn(
										"h-4 w-4 transition-transform group-hover:scale-110",
										isActive ? "text-primary" : "text-muted-foreground/70",
									)}
								/>
								{link.label}
								{isActive && (
									<div className="ml-auto w-1 h-4 bg-primary rounded-full" />
								)}
							</Link>
						);
					})}
				</nav>
			</div>

			<div className="p-4 mt-auto">
				<div className="bg-accent/30 rounded-xl p-3 border border-border/50">
					<p className="text-[10px] font-bold text-muted-foreground uppercase mb-2">
						Logged in as
					</p>
					<div className="flex items-center gap-2">
						<div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs capitalize">
							{role}
						</div>
						<div className="flex flex-col">
							<span className="text-xs font-semibold capitalize">{role}</span>
							<span className="text-[10px] text-muted-foreground italic">
								v1.2.0-stable
							</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
