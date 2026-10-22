import { motion } from "motion/react";
import { ui } from "../ui/styles";
import { press } from "../ui/motion";

const VARIANTS = {
	primary: ui.btnPrimary,
	success: ui.btnSuccess,
	warn: ui.btnWarn,
	danger: ui.btnDanger,
	ghost: ui.btnGhost,
	icon: ui.btnIcon,
	btnIcon: ui.btnIcon,
	chip: ui.chip,
};

export function Button({
	size = "md",
	variant = "primary",
	className = "",
	...props
}) {
	const isIcon = variant === "icon" || variant === "btnIcon";
	const sizeClass = isIcon
		? ""
		: size === "sm"
			? ui.btnSm
			: size === "lg"
				? ui.btnLg
				: ui.btnMd;

	return (
		<motion.button
			type="button"
			{...press}
			className={`${ui.btnBase} ${sizeClass} ${VARIANTS[variant] ?? ui.btnPrimary} ${className}`}
			{...props}
		/>
	);
}
