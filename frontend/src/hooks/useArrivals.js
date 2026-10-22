import { useCallback, useEffect, useRef, useState } from "react";

const PREF = "eziarr-notify";

const readPref = () => {
	try {
		return localStorage.getItem(PREF) === "on";
	} catch {
		return false;
	}
};

const supported = () => typeof Notification !== "undefined";

const notify = async (title, body) => {
	// Android shows notifications only through a service worker.
	const reg = await navigator.serviceWorker?.getRegistration?.();
	if (reg) return reg.showNotification(title, { body, icon: "/icon-192.png" });
	new Notification(title, { body, icon: "/icon-192.png" });
};

/**
 * Titles that finished: seen on the way at some point in this session and
 * now gone from the missing list. The two rarely change together (an *Arr
 * drops a title from its queue when it imports it; Eziarr's list catches up
 * at its next sync), so every title seen downloading is remembered until it
 * leaves the list. Each one gets a toast, and a system notification when
 * the user turned them on and the tab is in the background. Works only
 * while Eziarr is open somewhere: there is no push server.
 */
export const useArrivals = ({ missing, queueByItem, ready, onArrive }) => {
	const [enabled, setEnabled] = useState(readPref);
	const [permission, setPermission] = useState(() =>
		supported() ? Notification.permission : "unsupported",
	);
	const seen = useRef(new Map()); // id → item, seen on the way

	useEffect(() => {
		if (!ready) return;
		for (const m of missing)
			if (queueByItem.has(m.id)) seen.current.set(m.id, m);
		const now = new Set(missing.map((m) => m.id));
		for (const [id, item] of seen.current) {
			if (now.has(id)) continue;
			seen.current.delete(id);
			const name = item.seriesTitle
				? `${item.seriesTitle} ${item.title.match(/S\d+E\d+/i)?.[0] ?? ""}`.trim()
				: item.title;
			onArrive?.(name);
			if (enabled && permission === "granted" && document.hidden)
				notify("Downloaded", name).catch(() => {});
		}
	}, [missing, queueByItem, ready, enabled, permission, onArrive]);

	// Titles the user stopped monitoring leave the list too; they weren't
	// downloaded, so they must not be announced.
	const forget = useCallback((ids) => {
		for (const id of ids) seen.current.delete(id);
	}, []);

	const toggle = async () => {
		if (!supported()) return;
		let next = !enabled;
		if (next && Notification.permission === "default") {
			const result = await Notification.requestPermission();
			setPermission(result);
			next = result === "granted";
		}
		try {
			localStorage.setItem(PREF, next ? "on" : "off");
		} catch {
			// Private mode: the choice lasts for this visit.
		}
		setEnabled(next);
	};

	return {
		notifications:
			permission === "unsupported"
				? "unsupported"
				: enabled && permission === "granted"
					? "on"
					: permission === "denied"
						? "blocked"
						: "off",
		toggleNotifications: toggle,
		forget,
	};
};
