import { ui } from "../ui/styles";

export function Panel({ solid = false, className = "", ...props }) {
	return (
		<div
			className={`${solid ? ui.panelSolid : ui.panel} ${className}`}
			{...props}
		/>
	);
}
