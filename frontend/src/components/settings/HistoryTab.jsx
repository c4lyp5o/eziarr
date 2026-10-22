import { rowMotion } from "../../ui/motion";
import { AnimatePresence, motion } from "motion/react";
import {
	Loader2,
	CheckCircle2,
	XCircle,
	Clock,
	HardDrive,
	History,
} from "lucide-react";
import { formatSize } from "../../utils/formatSize";
import { formatDuration } from "../../utils/formatDuration";

export default function HistoryTab({ history, historyIsLoading }) {
	return (
			<div className="h-full flex flex-col">
				{history.length === 0 && !historyIsLoading ? (
					<div className="flex flex-col items-center justify-center flex-1 text-center text-faint">
						<History
							size={48}
							className="mb-4 opacity-50 text-faint"
						/>
						<h3 className="text-lg font-semibold text-ink">
							No Download History
						</h3>
						<p className="text-sm mt-2 max-w-sm">
							Past downloads will be logged here.
						</p>
					</div>
				) : historyIsLoading ? (
					<div className="flex flex-col items-center justify-center flex-1 text-center text-faint">
						<Loader2
							size={48}
							className="mb-4 opacity-50 text-ink animate-spin"
						/>
						<h3 className="text-lg font-semibold text-ink">
							Loading history...
						</h3>
					</div>
				) : (
					<div className="space-y-3">
						<AnimatePresence initial={false}>
						{history.map((h) => (
							<motion.div
								{...rowMotion}
								
								key={h.id}
								className="bg-surface p-4 rounded-2xl flex items-center gap-4"
							>
								<div
									className={`pt-0.5 shrink-0 ${h.status === "completed" ? "text-positive" : "text-negative"}`}
								>
									{h.status === "completed" ? (
										<CheckCircle2 size={20} />
									) : (
										<XCircle size={20} />
									)}
								</div>
								<div className="flex-1 min-w-0">
									<div className="flex justify-between items-center mb-1">
										<h4 className="font-semibold text-ink text-sm truncate pr-4">
											{h.filename || "Unknown File"}
										</h4>
										<span className="text-xs text-faint font-semibold shrink-0">
											{new Date(h.finished_at).toLocaleDateString()}{" "}
											{new Date(h.finished_at).toLocaleTimeString([], {
												hour: "2-digit",
												minute: "2-digit",
											})}
										</span>
									</div>
									<div className="flex items-center gap-3 text-xs text-muted mt-1">
										<span className="capitalize font-medium text-ink bg-raised px-2 py-0.5 rounded-md">
											{h.service || "System"}
										</span>
										<span className="flex items-center gap-1">
											<Clock size={12} /> {formatDuration(h.duration_ms)}
										</span>
										{h.download_bytes > 0 && (
											<span className="flex items-center gap-1">
												<HardDrive size={12} />{" "}
												{formatSize(h.download_bytes)}
											</span>
										)}
										<span className="capitalize">{h.type}</span>
									</div>
									{h.status === "failed" && h.last_error && (
										<p className="text-xs text-negative mt-2 bg-neg-bg px-2 py-1.5 rounded border border-negative/30">
											{h.last_error}
										</p>
									)}
								</div>
							</motion.div>
						))}
					</AnimatePresence>
					</div>
				)}
			</div>
		
	);
}
