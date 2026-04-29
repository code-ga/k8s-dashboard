import { useRole } from "@/hooks/use-roles";
import { Skeleton } from "@/components/ui/skeleton";

interface RoleBadgeProps {
	roleId: string;
	className?: string;
	children?: React.ReactNode;
}

export function RoleBadge({ roleId, className, children }: RoleBadgeProps) {
	const { data: role, isLoading, isError } = useRole(roleId);

	if (isLoading) {
		return (
			<Skeleton
				className={`h-6 w-16 inline-flex items-center rounded-md ${className || ""}`}
			/>
		);
	}

	if (isError || !role) {
		return (
			<span
				className={`px-2 py-1 bg-destructive/10 text-destructive rounded-md text-sm inline-flex items-center gap-1 ${className || ""}`}
			>
				Unknown Role
				{children}
			</span>
		);
	}

	return (
		<span
			className={`px-2 py-1 bg-secondary rounded-md text-sm inline-flex items-center gap-1 ${className || ""}`}
		>
			{role.name}
			{children}
		</span>
	);
}
