import { rowMotion } from "../../ui/motion";
import { AnimatePresence, motion } from "motion/react";
import { Loader2, RefreshCw, Clock, ListOrdered } from "lucide-react";

export default function QueueTab({ queue, queueIsLoading }) {
	return (
		<div className="h-full flex flex-col">
			{queue.length === 0 && !queueIsLoading ? (
				<div className="flex flex-col items-center justify-center flex-1 text-center text-faint">
					<ListOrdered size={48} className="mb-4 opacity-50 text-faint" />
					<h3 className="text-lg font-semibold text-ink">
						No Downloads Queued
					</h3>
					<p className="text-sm mt-2 max-w-sm">Download queue is clear.</p>
				</div>
			) : queueIsLoading ? (
				<div className="flex flex-col items-center justify-center flex-1 text-center text-faint">
					<Loader2
						size={48}
						className="mb-4 opacity-50 text-ink animate-spin"
					/>
					<h3 className="text-lg font-semibold text-ink">
						Loading download queue...
					</h3>
				</div>
			) : (
				<div className="space-y-3">
					<AnimatePresence initial={false}>
						{queue.map((q) => {
							let payloadObj = {};
							try {
								payloadObj = JSON.parse(q.payload);
							} catch (_e) {}
							return (
								<motion.div
									{...rowMotion}
									key={q.id}
									className="bg-surface p-4 rounded-2xl flex items-center gap-4"
								>
									<div
										className={`pt-0.5 ${q.status === "retry" ? "text-warning" : q.status === "downloading" ? "text-ink" : "text-muted"}`}
									>
										{q.status === "downloading" ? (
											<RefreshCw className="animate-spin" size={20} />
										) : (
											<Clock size={20} />
										)}
									</div>
									<div className="flex-1 min-w-0">
										<div className="flex justify-between items-center mb-1">
											<div className="flex items-center gap-2">
												<h4 className="font-semibold text-ink text-sm capitalize">
													{q.type} Queue
												</h4>
												<span
													className={`text-xs font-semibold px-2 py-0.5 rounded-full ${q.status === "downloading" ? "bg-raised text-ink" : q.status === "retry" ? "bg-warn-bg text-warning" : "bg-raised text-muted"}`}
												>
													{q.status}
												</span>
											</div>
											<span className="text-xs text-faint font-semibold shrink-0">
												Added:{" "}
												{new Date(q.created_at).toLocaleTimeString([], {
													hour: "2-digit",
													minute: "2-digit",
												})}
											</span>
										</div>
										<p className="text-xs text-muted truncate mt-1">
											{payloadObj.filename || "Processing Metadata..."}
										</p>
										{q.status === "retry" && q.last_error && (
											<p className="text-xs text-warning mt-2">
												Will retry at{" "}
												{new Date(q.next_attempt).toLocaleTimeString()}. Reason:{" "}
												{q.last_error}
											</p>
										)}
									</div>
								</motion.div>
							);
						})}
					</AnimatePresence>
				</div>
			)}
		</div>
	);
}
