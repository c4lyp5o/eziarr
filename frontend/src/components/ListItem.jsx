import { ui } from "../ui/styles";

export function ListItem({ className = "", ...props }) {
	return <div className={`${ui.listRow} ${className}`} {...props} />;
}
