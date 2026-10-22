export const ui = {
	// Layout — elevation by lightness alone: ground → surface → raised.
	panel: "bg-surface rounded-[20px]",
	panelSolid: "bg-surface rounded-[20px]",
	sectionTitle: "text-base font-semibold text-ink flex items-center gap-2",
	muted: "text-faint",
	divider: "border-b border-line",

	// Inputs
	input:
		"w-full h-9 bg-ground border border-control rounded-full px-4 text-ink text-sm placeholder:text-faint focus:outline-none focus:border-ink transition-colors",

	// Buttons — one height per row, full pills; primary is the inverted pill.
	btnBase:
		"inline-flex items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer",
	btnSm: "h-8 px-3.5 text-[13px]",
	btnMd: "h-9 px-4 text-sm",
	btnLg: "h-10 px-5 text-sm",
	btnPrimary: "bg-primary text-on-primary hover:opacity-85",
	btnSuccess: "bg-raised text-ink hover:bg-active",
	btnWarn: "bg-raised text-ink hover:bg-active",
	btnDanger: "bg-neg-bg text-negative hover:brightness-110",
	btnGhost: "bg-raised text-ink hover:bg-active",
	btnIcon:
		"size-9 rounded-full bg-transparent text-muted hover:bg-raised hover:text-ink",
	chip: "rounded-full text-xs px-2.5 h-6 bg-raised text-ink num",

	// Lists/cards
	listRow:
		"flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between bg-surface p-3 pl-4 rounded-2xl hover:bg-raised transition-colors",
	card: "bg-surface rounded-2xl p-4",

	// Status pills: a pale tint with the same hue's ink.
	pillPositive:
		"inline-flex items-center gap-1 h-5 px-2 rounded-full text-xs font-medium bg-pos-bg text-positive",
	pillNegative:
		"inline-flex items-center gap-1 h-5 px-2 rounded-full text-xs font-medium bg-neg-bg text-negative",
	pillWarning:
		"inline-flex items-center gap-1 h-5 px-2 rounded-full text-xs font-medium bg-warn-bg text-warning",
	pillNeutral:
		"inline-flex items-center gap-1 h-5 px-2 rounded-full text-xs font-medium bg-raised text-ink",
};
