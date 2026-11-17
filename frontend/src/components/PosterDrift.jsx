import { lazy, Suspense, useEffect, useState } from "react";

const Scene = lazy(() => import("./PosterDriftScene"));

export default function PosterDrift(props) {
	const [ready, setReady] = useState(false);
	useEffect(() => {
		let idle;
		let timer;
		let second;
		let cancelled = false;
		// Allow the form to paint before downloading optional decoration.
		const first = requestAnimationFrame(() => {
			second = requestAnimationFrame(() => {
				const show = () => {
					if (!cancelled) setReady(true);
				};
				if ("requestIdleCallback" in window) {
					idle = window.requestIdleCallback(show, { timeout: 1500 });
				} else {
					timer = window.setTimeout(show, 100);
				}
			});
		});
		return () => {
			cancelled = true;
			cancelAnimationFrame(first);
			cancelAnimationFrame(second);
			if (idle !== undefined) window.cancelIdleCallback(idle);
			clearTimeout(timer);
		};
	}, []);
	return ready ? (
		<Suspense fallback={null}>
			<Scene {...props} />
		</Suspense>
	) : null;
}
