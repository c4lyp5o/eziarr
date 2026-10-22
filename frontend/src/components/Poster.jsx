import { useState } from "react";
import {
	motion,
	useMotionValue,
	useReducedMotion,
	useSpring,
	useTransform,
} from "motion/react";
import { Check, Film, Music, Tv } from "lucide-react";

import { softSpring } from "../ui/motion";

// Pieces shared by the wall's cards: a title's own card and a series card.

export const KIND = {
	radarr: { label: "Movie", icon: Film },
	sonarr: { label: "Episode", icon: Tv },
	lidarr: { label: "Album", icon: Music },
};

export const formatDate = (dateString, { day = true } = {}) => {
	if (!dateString) return null;
	const d = new Date(dateString);
	if (Number.isNaN(d.getTime())) return null;
	return d.toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		...(day ? { day: "numeric" } : {}),
	});
};

export const DOT = {
	positive: "bg-positive",
	warning: "bg-warning",
	neutral: "bg-faint",
};

// "00:34:10" → "34 min left"; anything shorter than a minute → "<1 min left".
export const formatTimeLeft = (timeleft) => {
	if (!timeleft) return null;
	const parts = String(timeleft).split(":").map(Number);
	if (parts.length !== 3 || parts.some(Number.isNaN)) return timeleft;
	const [h, m] = parts;
	if (h >= 24) return `${Math.floor(h / 24)} d left`;
	if (h > 0) return `${h} h ${m} min left`;
	return m > 0 ? `${m} min left` : "<1 min left";
};

export const DownloadRail = ({ progress, tone }) => {
	const known = Number.isFinite(progress);
	return (
		<div className="absolute inset-x-2 bottom-2 h-1.5 rounded-full bg-black/55 overflow-hidden">
			{known ? (
				<motion.div
					className={`h-full origin-left rounded-full ${tone === "warning" ? "bg-warning" : "bg-accent"}`}
					initial={{ scaleX: 0 }}
					animate={{ scaleX: progress / 100 }}
					transition={softSpring}
				/>
			) : (
				// No size reported yet: a short bar that sweeps, never a fake percent.
				<motion.div
					className={`h-full w-1/3 rounded-full ${tone === "warning" ? "bg-warning" : "bg-accent"}`}
					animate={{ x: ["-100%", "300%"] }}
					transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
				/>
			)}
		</div>
	);
};

const TILT = 9; // degrees at the poster's edge
const tiltSpring = { stiffness: 300, damping: 26 };

// The poster leans toward a mouse pointer and catches a soft light where it
// points. Mouse only: on touch a tilt would fight the scroll.
const usePosterTilt = () => {
	const still = useReducedMotion();
	const px = useMotionValue(0.5);
	const py = useMotionValue(0.5);
	const rotateY = useSpring(
		useTransform(px, [0, 1], [-TILT, TILT]),
		tiltSpring,
	);
	const rotateX = useSpring(
		useTransform(py, [0, 1], [TILT, -TILT]),
		tiltSpring,
	);
	const glareX = useTransform(px, [0, 1], ["-25%", "25%"]);
	const glareY = useTransform(py, [0, 1], ["-25%", "25%"]);

	const onPointerMove = (e) => {
		if (still || e.pointerType !== "mouse") return;
		const r = e.currentTarget.getBoundingClientRect();
		px.set((e.clientX - r.left) / r.width);
		py.set((e.clientY - r.top) / r.height);
	};
	const onPointerLeave = () => {
		px.set(0.5);
		py.set(0.5);
	};

	return {
		handlers: { onPointerMove, onPointerLeave },
		style: { rotateX, rotateY, transformPerspective: 700 },
		glare: { x: glareX, y: glareY },
	};
};

/** The 2:3 poster: image (or a titled fallback), tilt, and an overlay slot. */
export const Poster = ({ src, title, service, children }) => {
	const [failed, setFailed] = useState(!src);
	const [loaded, setLoaded] = useState(false);
	const tilt = usePosterTilt();
	const Icon = KIND[service]?.icon ?? Film;

	return (
		<motion.div
			className="relative aspect-2/3 overflow-hidden rounded-[14px] bg-raised"
			style={tilt.style}
			{...tilt.handlers}
		>
			{failed ? (
				<div className="absolute inset-0 flex flex-col justify-between p-3 bg-raised">
					<Icon size={18} className="text-faint" />
					<span className="text-[15px] font-semibold leading-snug text-muted line-clamp-4">
						{title}
					</span>
				</div>
			) : (
				<motion.img
					src={src}
					alt=""
					loading="lazy"
					onLoad={() => setLoaded(true)}
					onError={() => setFailed(true)}
					className="absolute inset-0 w-full h-full object-cover"
					initial={false}
					animate={{ opacity: loaded ? 1 : 0 }}
					variants={{ hover: { scale: 1.04 }, rest: { scale: 1 } }}
					transition={{ opacity: { duration: 0.35 }, scale: softSpring }}
				/>
			)}
			<motion.div
				aria-hidden="true"
				className="pointer-events-none absolute -inset-1/4 bg-[radial-gradient(circle_at_center,rgb(255_255_255/0.22),transparent_55%)]"
				style={tilt.glare}
				variants={{ hover: { opacity: 1 }, rest: { opacity: 0 } }}
				transition={{ duration: 0.25 }}
			/>
			{children}
		</motion.div>
	);
};

/**
 * The card's frame. In selection mode one button covers the whole card, so
 * a tap anywhere picks it and its own buttons can't fire by accident.
 */
export const CardShell = ({ selection, label, children }) => (
	<motion.article
		className={`group relative flex flex-col h-full bg-surface rounded-[20px] p-2 transition-shadow ${
			selection?.selected ? "ring-2 ring-accent" : ""
		}`}
		whileHover="hover"
		initial="rest"
		animate="rest"
	>
		{children}
		{selection && (
			<button
				type="button"
				aria-pressed={selection.selected}
				aria-label={`Select ${label}`}
				onClick={selection.toggle}
				className="absolute inset-0 z-10 rounded-[20px] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
			>
				<span
					className={`absolute top-4 left-4 size-6 grid place-items-center rounded-full border-2 transition-colors ${
						selection.selected
							? "bg-accent border-accent text-accent-ink"
							: "bg-black/40 border-white/80 text-transparent"
					}`}
				>
					<Check size={14} strokeWidth={3} />
				</span>
			</button>
		)}
	</motion.article>
);
