import { useEffect, useState } from "react";

const STORAGE_KEY = "eziarr-theme";
const media = () => window.matchMedia("(prefers-color-scheme: light)");

const readStored = () => {
	try {
		const v = localStorage.getItem(STORAGE_KEY);
		return v === "light" || v === "dark" ? v : null;
	} catch {
		return null;
	}
};

const systemTheme = () => (media().matches ? "light" : "dark");

const apply = (theme) => {
	document.documentElement.dataset.theme = theme;
};

// Set before React renders so the first paint is already in the right theme.
apply(readStored() ?? systemTheme());

/**
 * The current theme and a toggle. Follows the OS until the user picks one;
 * the pick is remembered per browser.
 */
export const useTheme = () => {
	const [theme, setTheme] = useState(() => readStored() ?? systemTheme());

	useEffect(() => {
		apply(theme);
	}, [theme]);

	useEffect(() => {
		const mq = media();
		const onChange = () => {
			if (!readStored()) setTheme(systemTheme());
		};
		mq.addEventListener("change", onChange);
		return () => mq.removeEventListener("change", onChange);
	}, []);

	const toggle = () => {
		const next = theme === "dark" ? "light" : "dark";
		try {
			localStorage.setItem(STORAGE_KEY, next);
		} catch {
			// Private mode: the toggle still works for this visit.
		}
		setTheme(next);
	};

	return { theme, toggle };
};
