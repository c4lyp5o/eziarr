import { useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { EyeOff, RefreshCw, Search, X } from "lucide-react";

import { spring } from "../ui/motion";
import { Button } from "./Buttons";

/**
 * The action bar for selection mode, docked at the bottom of the screen.
 * Stopping monitoring asks once, in the bar itself.
 */
export function BulkBar({
	open,
	count,
	shown,
	onSelectShown,
	onClear,
	onRun,
	onClose,
}) {
	const [busy, setBusy] = useState(null);
	const [confirming, setConfirming] = useState(false);

	const run = async (action) => {
		setBusy(action);
		try {
			await onRun(action);
		} finally {
			setBusy(null);
			setConfirming(false);
		}
	};

	return createPortal(
		<AnimatePresence>
			{open && (
				<motion.div
					role="toolbar"
					aria-label="Selected titles"
					className="fixed z-40 bottom-4 inset-x-4 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 flex flex-wrap items-center gap-2 p-2 pl-4 rounded-[20px] bg-raised shadow-[0_16px_48px_rgb(0_0_0/0.35)]"
					initial={{ opacity: 0, y: 24 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: 24 }}
					transition={spring}
				>
					<p className="text-sm font-medium text-ink num mr-1">
						{count} selected
					</p>
					{confirming ? (
						<>
							<span className="text-sm text-muted">Stop monitoring them?</span>
							<Button
								size="sm"
								variant="ghost"
								onClick={() => setConfirming(false)}
							>
								Keep
							</Button>
							<Button
								size="sm"
								variant="danger"
								disabled={busy !== null}
								onClick={() => run("unmonitor")}
							>
								{busy === "unmonitor" && (
									<RefreshCw size={14} className="animate-spin" />
								)}
								Stop monitoring {count}
							</Button>
						</>
					) : (
						<>
							{count < shown ? (
								<Button size="sm" variant="ghost" onClick={onSelectShown}>
									Select all {shown}
								</Button>
							) : (
								count > 0 && (
									<Button size="sm" variant="ghost" onClick={onClear}>
										Clear
									</Button>
								)
							)}
							<Button
								size="sm"
								disabled={!count || busy !== null}
								onClick={() => run("search")}
							>
								{busy === "search" ? (
									<RefreshCw size={14} className="animate-spin" />
								) : (
									<Search size={14} />
								)}
								Search
							</Button>
							<Button
								size="sm"
								variant="ghost"
								disabled={!count || busy !== null}
								onClick={() => setConfirming(true)}
							>
								<EyeOff size={14} />
								Stop monitoring
							</Button>
						</>
					)}
					<Button
						variant="icon"
						className="size-8!"
						onClick={onClose}
						title="Leave selection (Esc)"
						aria-label="Leave selection"
					>
						<X size={16} />
					</Button>
				</motion.div>
			)}
		</AnimatePresence>,
		document.body,
	);
}
