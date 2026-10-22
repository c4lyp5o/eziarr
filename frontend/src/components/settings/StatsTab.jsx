import {
	Server,
	Film,
	Tv,
	Loader2,
	Clock,
	HardDrive,
	BarChart3,
} from "lucide-react";
import { formatSize } from "../../utils/formatSize";
import { formatDuration } from "../../utils/formatDuration";

export default function StatsTab({ stats, statsIsLoading }) {
	return (
			<div className="h-full flex flex-col">
				{stats.length === 0 && !statsIsLoading ? (
					<div className="flex flex-col items-center justify-center flex-1 text-center text-faint">
						<BarChart3
							size={48}
							className="mb-4 opacity-50 text-faint"
						/>
						<h3 className="text-lg font-semibold text-ink">
							No Download Stats
						</h3>
						<p className="text-sm mt-2 max-w-sm">
							Finish some downloads to populate your analytics dashboard.
						</p>
					</div>
				) : statsIsLoading ? (
					<div className="flex flex-col items-center justify-center flex-1 text-center text-faint">
						<Loader2
							size={48}
							className="mb-4 opacity-50 text-warning animate-spin"
						/>
						<h3 className="text-lg font-semibold text-ink">
							Crunching numbers...
						</h3>
					</div>
				) : (
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						{stats.map((s) => (
							<div
								key={s.service}
								className="bg-surface p-4 rounded-2xl flex flex-col transition-colors"
							>
								<div className="flex items-center justify-between border-b border-line pb-2 mb-3">
									<h4 className="font-semibold text-ink capitalize flex items-center gap-2">
										{s.service === "radarr" ? (
											<Film size={16} />
										) : s.service === "sonarr" ? (
											<Tv size={16} />
										) : (
											<Server size={16} />
										)}
										{s.service}
									</h4>
									<span className="text-xs text-muted num">
										{s.total} {s.total === 1 ? "job" : "jobs"}
									</span>
								</div>

								<div className="grid grid-cols-2 gap-3 mb-4 mt-2">
									<div className="bg-ground rounded-2xl p-3">
										<p className="text-xs text-faint mb-1">Imported</p>
										<p className="text-2xl font-semibold text-ink num">{s.completed}</p>
									</div>
									<div className="bg-ground rounded-2xl p-3">
										<p className="text-xs text-faint mb-1">Failed</p>
										<p className={`text-2xl font-semibold num ${s.failed > 0 ? "text-negative" : "text-ink"}`}>
											{s.failed}
										</p>
									</div>
								</div>

								<div className="flex justify-between items-center text-xs text-muted mt-auto pt-3 border-t border-line">
									<span
										className="flex items-center gap-1.5"
										title="Average Download Time"
									>
										<Clock size={14} />{" "}
										{formatDuration(s.avg_duration_ms)} avg
									</span>
									<span
										className="flex items-center gap-1.5"
										title="Total Bandwidth"
									>
										<HardDrive size={14} /> {formatSize(s.bytes)}
									</span>
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		
	);
}
