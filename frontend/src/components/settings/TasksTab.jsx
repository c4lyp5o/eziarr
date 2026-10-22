import { rowMotion } from "../../ui/motion";
import { AnimatePresence, motion } from "motion/react";
import { Loader2, Activity, RefreshCw } from "lucide-react";

export default function TasksTab({ tasks, taskIsLoading }) {
	return (
		<div className="h-full flex flex-col">
			{tasks.length === 0 && !taskIsLoading ? (
				<div className="flex flex-col items-center justify-center flex-1 text-center text-faint">
					<Activity size={48} className="mb-4 opacity-50 text-faint" />
					<h3 className="text-lg font-semibold text-ink">No Active Tasks</h3>
					<p className="text-sm mt-2 max-w-sm">Eziarr is currently idle.</p>
				</div>
			) : taskIsLoading ? (
				<div className="flex flex-col items-center justify-center flex-1 text-center text-faint">
					<Loader2
						size={48}
						className="mb-4 opacity-50 text-positive animate-spin"
					/>
					<h3 className="text-lg font-semibold text-ink">Loading tasks...</h3>
				</div>
			) : (
				<div className="space-y-3">
					<AnimatePresence initial={false}>
						{tasks.map((task) => (
							<motion.div
								{...rowMotion}
								key={task.id}
								className="bg-surface p-4 rounded-2xl flex items-center gap-4"
							>
								<div className="text-positive pt-0.5">
									<RefreshCw className="text-positive animate-spin" size={20} />
								</div>
								<div className="flex-1 min-w-0">
									<div className="flex justify-between items-center mb-1">
										<h4 className="font-semibold text-ink text-sm flex items-center gap-2 capitalize">
											{task.type}
										</h4>
										<span className="text-xs text-faint font-semibold">
											{new Date(task.updated_at).toLocaleTimeString()}
										</span>
									</div>
									<p className="text-xs text-muted truncate">{task.message}</p>
									{task.progress > 0 && task.progress < 100 && (
										<div className="w-full bg-raised rounded-full h-1.5 mt-2 overflow-hidden">
											<div
												className="bg-accent h-1.5 rounded-full transition-[width] duration-500 ease-out"
												style={{ width: `${task.progress}%` }}
											></div>
										</div>
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
