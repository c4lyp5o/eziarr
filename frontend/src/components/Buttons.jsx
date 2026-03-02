import { ui } from "../ui/styles";

export const FilterButton = ({
	id,
	label,
	icon: Icon,
	activeFilter,
	setActiveFilter,
}) => (
	<button
		type="button"
		onClick={() => setActiveFilter(id)}
		className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
			activeFilter === id
				? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20 scale-105"
				: "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white"
		}`}
	>
		<Icon size={14} />
		{label}
	</button>
);

export function Button({
	size = "md",
	variant = "primary",
	className = "",
	...props
}) {
	const sizeClass =
		size === "sm" ? ui.btnSm : size === "lg" ? ui.btnLg : ui.btnMd;

	const variantClass =
		variant === "primary"
			? ui.btnPrimary
			: variant === "success"
				? ui.btnSuccess
				: variant === "warn"
					? ui.btnWarn
					: variant === "danger"
						? ui.btnDanger
						: variant === "ghost"
							? ui.btnGhost
							: variant === "icon"
								? ui.btnIcon
								: variant === "chip"
									? ui.chip
									: ui.btnPrimary;

	return (
		<button
			type="button"
			className={`${ui.btnBase} ${sizeClass} ${variantClass} ${className}`}
			{...props}
		/>
	);
}
