import { useEffect, useState } from "react";
import useSWR from "swr";

import { apiCall } from "../utils/apiCall";

const STREAM = "/api/v1/missing/stream";
const RETRY_MS = 5000;

/**
 * The missing list and queue, kept current by the server's event stream.
 * The first load and every fallback go through SWR; while the stream is
 * open the 10 s poll is off and each event updates the same cache, so
 * mutate() and the rest of the app don't know the difference. When the
 * stream drops (the session lapsed, the server restarted) polling resumes
 * and the stream is reopened after a fetch, which refreshes the session.
 */
export const useLiveMissing = (enabled, { onUpdate } = {}) => {
	const [live, setLive] = useState(false);

	const swr = useSWR(enabled ? "/api/v1/missing" : null, apiCall, {
		refreshInterval: live ? 0 : 10000,
		dedupingInterval: 5000,
		revalidateOnFocus: false,
		onSuccess: () => onUpdate?.(),
	});
	const { mutate } = swr;

	useEffect(() => {
		if (!enabled || typeof EventSource === "undefined") return;
		let source;
		let retry;
		let stopped = false;

		const merge = (patch) => {
			setLive(true);
			mutate((prev) => ({ success: true, ...prev, ...patch }), {
				revalidate: false,
			});
			onUpdate?.();
		};

		const open = () => {
			source = new EventSource(STREAM);
			// Live only once an event arrives, not on open: a proxy that
			// buffers the stream would otherwise leave the wall frozen with
			// polling switched off.
			source.addEventListener("missing", (e) =>
				merge({ missing: JSON.parse(e.data) }),
			);
			source.addEventListener("queue", (e) => merge(JSON.parse(e.data)));
			source.onerror = () => {
				setLive(false);
				// CONNECTING: the browser is already retrying a network blip.
				if (source.readyState !== EventSource.CLOSED) return;
				retry = setTimeout(async () => {
					await mutate().catch(() => {});
					if (!stopped) open();
				}, RETRY_MS);
			};
		};
		open();

		return () => {
			stopped = true;
			clearTimeout(retry);
			source?.close();
			setLive(false);
		};
	}, [enabled, mutate, onUpdate]);

	return { ...swr, live };
};
