import { useEffect } from "react";

const typing = (el) =>
	el instanceof HTMLElement &&
	(el.isContentEditable ||
		["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));

/**
 * `/` jumps to the search box; Esc clears it, or leaves selection mode.
 * Both stand aside while a dialog is open (it has its own Esc) or while
 * the user is typing somewhere else.
 */
export const useShortcuts = ({ searchRef, onClearSearch, onEscape }) => {
	useEffect(() => {
		const onKey = (e) => {
			if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
			if (document.querySelector('[role="dialog"]')) return;
			const search = searchRef.current;

			if (e.key === "/" && !typing(document.activeElement)) {
				e.preventDefault();
				search?.focus();
				search?.select();
			} else if (e.key === "Escape") {
				if (document.activeElement === search) {
					onClearSearch();
					search.blur();
				} else if (!typing(document.activeElement)) {
					onEscape?.();
				}
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [searchRef, onClearSearch, onEscape]);
};
