import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { Server } from "lucide-react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";

export function ClusterSwitcher() {
	const { id: currentClusterId } = useParams({ strict: false }) as {
		id?: string;
	};
	const navigate = useNavigate();

	const { data: clusters } = useQuery({
		queryKey: ["clusters"],
		queryFn: async () => {
			const res = await api.api.cluster.get();
			if (res.error) throw res.error;
			return res.data.data;
		},
	});

	if (!currentClusterId || !clusters || clusters.length === 0) {
		return null;
	}

	const handleValueChange = (value: string) => {
		navigate({
			to: "/dashboard/cluster/$id",
			params: { id: value },
		});
	};

	return (
		<div className="flex items-center gap-2">
			<Select value={currentClusterId} onValueChange={handleValueChange}>
				<SelectTrigger className="w-[180px] h-9 focus:ring-0">
					<div className="flex items-center gap-2 truncate">
						<Server className="h-4 w-4 shrink-0 text-primary" />
						<SelectValue placeholder="Select Cluster" />
					</div>
				</SelectTrigger>
				<SelectContent>
					{clusters.map((cluster) => (
						<SelectItem key={cluster.id} value={String(cluster.id)}>
							{cluster.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}
