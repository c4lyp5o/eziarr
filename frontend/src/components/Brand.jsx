import { Mark } from "./Mark";

// The brand row every ez app uses: the shared ez icon (the favicon file),
// the lowercase name, and an optional scope after a divider.
export function Brand({ name, scope, size = 20 }) {
	return (
		<span className="flex min-w-0 items-center gap-2.5 text-ink">
			<Mark size={size} className="flex-none" />
			<strong className="text-[15px] font-semibold tracking-[-0.01em]">
				{name}
			</strong>
			{scope && (
				<span className="truncate border-l border-control pl-3 text-xs text-muted">
					{scope}
				</span>
			)}
		</span>
	);
}
