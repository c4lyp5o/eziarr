import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";

import { spring } from "../ui/motion";
import { Button } from "./Buttons";

/**
 * A dialog that rises from the bottom on a phone and scales in on desktop.
 * Children render only while open; Escape and the scrim close it.
 */
export function Modal({
	isOpen,
	onClose,
	title,
	subtitle,
	size = "lg",
	children,
	labelledBy = "modal-title",
	dismissable = true,
}) {
	useEffect(() => {
		if (!isOpen || !dismissable) return;
		const onKey = (e) => e.key === "Escape" && onClose?.();
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [isOpen, onClose, dismissable]);

	const width =
		size === "sm" ? "sm:max-w-sm" : size === "md" ? "sm:max-w-xl" : "sm:max-w-5xl";

	// Portalled: a tile animating its transform would otherwise become the
	// containing block for this fixed overlay.
	return createPortal(
		<AnimatePresence>
			{isOpen && (
				<motion.div
					className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.18 }}
				>
					<div
						className="absolute inset-0 bg-scrim"
						onClick={dismissable ? onClose : undefined}
						aria-hidden="true"
					/>
					<motion.div
						role="dialog"
						aria-modal="true"
						aria-labelledby={labelledBy}
						className={`relative w-full ${width} max-h-[92dvh] sm:max-h-[86dvh] flex flex-col bg-surface rounded-t-[20px] sm:rounded-[20px] shadow-[0_24px_64px_rgb(0_0_0/0.45)] overflow-hidden`}
						initial={{ opacity: 0, y: 40, scale: 0.97 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0, y: 24, scale: 0.98, transition: { duration: 0.15 } }}
						transition={spring}
					>
						{title && (
							<div className="flex shrink-0 items-start justify-between gap-4 px-5 sm:px-6 pt-5 pb-4">
								<div className="min-w-0">
									<h2
										id={labelledBy}
										className="text-lg font-semibold text-ink leading-tight wrap-break-word"
									>
										{title}
									</h2>
									{subtitle && (
										<p className="text-sm text-muted mt-1">{subtitle}</p>
									)}
								</div>
								{dismissable && (
									<Button variant="icon" onClick={onClose} aria-label="Close">
										<X size={18} />
									</Button>
								)}
							</div>
						)}
						{children}
					</motion.div>
				</motion.div>
			)}
		</AnimatePresence>,
		document.body,
	);
}
