import { Link, useLocation } from "@tanstack/react-router";
import { ChevronRight, Home } from "lucide-react";
import React from "react";

export function BreadcrumbNav() {
	const location = useLocation();
	const pathnames = location.pathname.split("/").filter((x) => x);

	// Map of path segments to readable labels
	const labelMap: Record<string, string> = {
		dashboard: "Dashboard",
		cluster: "Clusters",
		pods: "Pods",
		deployments: "Deployments",
		services: "Services",
		ingresses: "Ingresses",
		configmaps: "ConfigMaps",
		secrets: "Secrets",
		nodes: "Nodes",
		settings: "Settings",
		users: "Users",
		create: "Create",
		edit: "Edit",
	};

	const getLabel = (segment: string, index: number) => {
		// If it's a UUID/ID (usually after 'cluster' or other resource)
		if (segment.length > 20 || (!labelMap[segment] && index > 0)) {
			return segment.substring(0, 8) + "...";
		}
		return (
			labelMap[segment] || segment.charAt(0).toUpperCase() + segment.slice(1)
		);
	};

	return (
		<nav
			aria-label="Breadcrumb"
			className="flex items-center text-sm text-muted-foreground overflow-x-auto whitespace-nowrap scrollbar-hide"
		>
			<ol className="flex items-center space-x-2">
				<li>
					<Link
						to="/"
						className="hover:text-foreground transition-colors flex items-center"
					>
						<Home size={14} className="mr-1" />
					</Link>
				</li>
				{pathnames.map((segment, index) => {
					const url = `/${pathnames.slice(0, index + 1).join("/")}`;
					const isLast = index === pathnames.length - 1;
					const label = getLabel(segment, index);

					return (
						<React.Fragment key={url}>
							<ChevronRight
								size={14}
								className="text-muted-foreground/50 shrink-0"
							/>
							<li>
								{isLast ? (
									<span className="font-medium text-foreground truncate max-w-[120px] block">
										{label}
									</span>
								) : (
									<Link
										to={url as any}
										className="hover:text-foreground transition-colors truncate max-w-[100px] block"
									>
										{label}
									</Link>
								)}
							</li>
						</React.Fragment>
					);
				})}
			</ol>
		</nav>
	);
}
