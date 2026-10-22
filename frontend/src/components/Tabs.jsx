import { motion } from "motion/react";
import { spring } from "../ui/motion";

/**
 * Underline tabs on a full-width rule. The selected label goes to full ink
 * and a 2px bar slides under it (shared layoutId per tab group).
 */
export function Tabs({ id, tabs, active, onChange, className = "" }) {
	return (
		<div
			role="tablist"
			className={`flex shrink-0 gap-1 overflow-x-auto no-scrollbar border-b border-line px-3 sm:px-4 ${className}`}
		>
			{tabs.map((tab) => {
				const selected = active === tab.id;
				return (
					<button
						type="button"
						role="tab"
						aria-selected={selected}
						key={tab.id}
						onClick={() => onChange(tab.id)}
						className={`relative flex items-center gap-2 h-11 px-3 text-sm font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
							selected ? "text-ink" : "text-faint hover:text-muted"
						}`}
					>
						{tab.icon && <tab.icon size={15} />}
						{tab.label}
						{tab.count != null && (
							<span className="num text-xs text-faint">{tab.count}</span>
						)}
						{selected && (
							<motion.span
								layoutId={`tab-underline-${id}`}
								className="absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-ink"
								transition={spring}
							/>
						)}
					</button>
				);
			})}
		</div>
	);
}
