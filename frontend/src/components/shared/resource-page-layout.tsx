import { useParams } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, ExternalLink, Plus } from "lucide-react";
import type React from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface ResourcePageLayoutProps {
	title: string;
	subtitle?: string;
	description: string;
	helpLink: string;
	createLink?: string;
	createLabel?: string;
	canCreate?: boolean;
	children: React.ReactNode;
	backLink?: string;
	extraActions?: React.ReactNode;
}

export function ResourcePageLayout({
	title,
	subtitle,
	description,
	helpLink,
	createLink,
	createLabel = "Create",
	canCreate = false,
	children,
	backLink,
	extraActions,
}: ResourcePageLayoutProps) {
	const { id } = useParams({ strict: false }) as { id?: string };
	const resolvedBackLink = backLink || `/dashboard/cluster/${id}`;

	return (
		<div className="space-y-6">
			{/* Header Section */}
			<div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
				<div className="flex items-center gap-4">
					<Link to={resolvedBackLink}>
						<Button
							variant="ghost"
							size="icon"
							className="hover:bg-accent/50 transition-colors"
						>
							<ArrowLeft className="h-4 w-4" />
						</Button>
					</Link>
					<div>
						<h1 className="text-3xl font-bold tracking-tight text-foreground">
							{title}
						</h1>
						{subtitle && (
							<p className="text-muted-foreground font-medium">{subtitle}</p>
						)}
					</div>
				</div>
				<div className="flex items-center gap-2">
					{extraActions}
					{canCreate && createLink && (
						<Link to={createLink as any} params={{ id } as any}>
							<Button className="shadow-md transition-all active:scale-95">
								<Plus className="mr-2 h-4 w-4" /> {createLabel}
							</Button>
						</Link>
					)}
				</div>
			</div>

			{/* Summary / Help Section */}
			<Card className="bg-muted/30 border-dashed shadow-none">
				<CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
					<div className="p-2 bg-primary/10 rounded-lg text-primary shrink-0">
						<BookOpen className="h-5 w-5" />
					</div>
					<div className="flex-1 space-y-1">
						<p className="text-sm font-medium leading-none">About {title}</p>
						<p className="text-xs text-muted-foreground leading-relaxed">
							{description}
						</p>
					</div>
					<a
						href={helpLink}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline underline-offset-4 shrink-0 transition-all"
					>
						Documentation <ExternalLink className="h-3 w-3" />
					</a>
				</CardContent>
			</Card>

			{/* Main Content (Table/Grid) */}
			<Card className="border shadow-xs overflow-hidden min-h-[400px]">
				<CardContent className="p-0">{children}</CardContent>
			</Card>
		</div>
	);
}
