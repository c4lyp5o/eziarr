import { useState } from "react";
import {
	motion,
	useMotionValue,
	useReducedMotion,
	useSpring,
	useTransform,
} from "motion/react";
import {
	Search,
	RefreshCw,
	Film,
	Tv,
	Music,
	EyeOff,
	Globe,
} from "lucide-react";

import { apiCall } from "../utils/apiCall";
import { useToast } from "../context/Toast";
import { softSpring } from "../ui/motion";
import { describeQueue } from "../utils/queueState";

import { Button } from "./Buttons";
import { Modal } from "./Modal";

const KIND = {
	radarr: { label: "Movie", icon: Film },
	sonarr: { label: "Episode", icon: Tv },
	lidarr: { label: "Album", icon: Music },
};

const formatDate = (dateString) => {
	if (!dateString) return null;
	const d = new Date(dateString);
	if (Number.isNaN(d.getTime())) return null;
	return d.toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
};

const DOT = {
	positive: "bg-positive",
	warning: "bg-warning",
	neutral: "bg-faint",
};

// "00:34:10" → "34 min left"; anything shorter than a minute → "<1 min left".
const formatTimeLeft = (timeleft) => {
	if (!timeleft) return null;
	const parts = String(timeleft).split(":").map(Number);
	if (parts.length !== 3 || parts.some(Number.isNaN)) return timeleft;
	const [h, m] = parts;
	if (h >= 24) return `${Math.floor(h / 24)} d left`;
	if (h > 0) return `${h} h ${m} min left`;
	return m > 0 ? `${m} min left` : "<1 min left";
};

const PosterFallback = ({ item }) => {
	const Icon = KIND[item.service]?.icon ?? Film;
	return (
		<div className="absolute inset-0 flex flex-col justify-between p-3 bg-raised">
			<Icon size={18} className="text-faint" />
			<span className="text-[15px] font-semibold leading-snug text-muted line-clamp-4">
				{item.seriesTitle || item.title}
			</span>
		</div>
	);
};

const DownloadRail = ({ progress, tone }) => {
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

const MediaCard = ({
	item,
	queueItem,
	onSearch,
	onDeepSearch,
	isSearching,
	mutate,
}) => {
	const { toast } = useToast();

	const [imgFailed, setImgFailed] = useState(!item.posterUrl);
	const [imgLoaded, setImgLoaded] = useState(false);
	const [showUnmonitorModal, setShowUnmonitorModal] = useState(false);
	const [isUnmonitoring, setIsUnmonitoring] = useState(false);
	const tilt = usePosterTilt();

	const kind = KIND[item.service] ?? { label: item.service, icon: Film };
	const released = formatDate(item.releaseDate);
	const state = describeQueue(queueItem);
	const progress =
		queueItem?.progress == null ? Number.NaN : Number(queueItem.progress);

	const confirmUnmonitor = async () => {
		try {
			setIsUnmonitoring(true);
			await apiCall("/api/v1/missing/unmonitor", {
				method: "POST",
				body: {
					service: item.service,
					serviceId: item.serviceId,
				},
			});
			toast.success(`Stopped monitoring ${item.title}`);
			setShowUnmonitorModal(false);
			mutate();
		} catch (_err) {
			toast.error("Couldn't stop monitoring. Try again.");
		} finally {
			setIsUnmonitoring(false);
		}
	};

	const heading = item.seriesTitle || item.title;
	const subheading = item.seriesTitle ? item.title : null;

	return (
		<>
			<motion.article
				className="group flex flex-col h-full bg-surface rounded-[20px] p-2"
				whileHover="hover"
				initial="rest"
				animate="rest"
			>
				<motion.div
					className="relative aspect-2/3 overflow-hidden rounded-[14px] bg-raised"
					style={tilt.style}
					{...tilt.handlers}
				>
					{imgFailed ? (
						<PosterFallback item={item} />
					) : (
						<motion.img
							src={item.posterUrl}
							alt=""
							loading="lazy"
							onLoad={() => setImgLoaded(true)}
							onError={() => setImgFailed(true)}
							className="absolute inset-0 w-full h-full object-cover"
							initial={false}
							animate={{ opacity: imgLoaded ? 1 : 0 }}
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
					{state && <DownloadRail progress={progress} tone={state.tone} />}
				</motion.div>

				<div className="flex flex-col gap-0.5 px-1.5 pt-3 pb-1">
					<h3
						className="text-sm font-medium text-ink leading-snug line-clamp-2"
						title={heading}
					>
						{heading}
					</h3>
					{subheading && (
						<p
							className="text-[13px] text-muted line-clamp-2 wrap-break-word"
							title={subheading}
						>
							{subheading}
						</p>
					)}
					<p className="text-xs text-faint num">
						{kind.label}
						{released ? ` · ${released}` : ""}
					</p>
				</div>

				<div className="mt-auto flex items-center gap-1 px-1 pt-2 min-h-10">
					{state ? (
						<p className="flex items-center gap-2 min-w-0 px-1.5 text-xs num">
							<span
								className={`size-1.5 shrink-0 rounded-full ${DOT[state.tone]}`}
							/>
							<span className="text-ink font-medium whitespace-nowrap">
								{state.label}
							</span>
							<span className="text-faint truncate">
								{Number.isFinite(progress)
									? `${progress}%`
									: formatTimeLeft(queueItem.timeleft) || "—"}
							</span>
						</p>
					) : (
						<>
							<Button
								size="sm"
								variant="ghost"
								onClick={() => onSearch(item.service, item.serviceId, item.id)}
								disabled={isSearching}
								aria-label={`Search for ${heading}`}
							>
								{isSearching ? (
									<RefreshCw size={14} className="animate-spin" />
								) : (
									<Search size={14} />
								)}
								{isSearching ? "Searching" : "Search"}
							</Button>
							<Button
								variant="icon"
								className="size-8!"
								onClick={(e) => {
									e.stopPropagation();
									onDeepSearch();
								}}
								title="Deep search other sources"
								aria-label={`Deep search other sources for ${heading}`}
							>
								<Globe size={15} />
							</Button>
						</>
					)}
					{!state && (
						<Button
							variant="icon"
							className="size-8! ml-auto"
							onClick={(e) => {
								e.stopPropagation();
								setShowUnmonitorModal(true);
							}}
							title="Stop monitoring"
							aria-label={`Stop monitoring ${heading}`}
						>
							<EyeOff size={15} />
						</Button>
					)}
				</div>
			</motion.article>

			<Modal
				isOpen={showUnmonitorModal}
				onClose={() => !isUnmonitoring && setShowUnmonitorModal(false)}
				size="sm"
				labelledBy={`unmonitor-${item.id}`}
				title="Stop monitoring?"
			>
				<div className="px-5 sm:px-6 pb-5">
					<p className="text-sm text-muted">
						<span className="text-ink font-medium">{heading}</span> leaves this
						list and{" "}
						{kind.label === "Movie"
							? "Radarr"
							: kind.label === "Episode"
								? "Sonarr"
								: "Lidarr"}{" "}
						stops looking for it. You can monitor it again from the *Arr.
					</p>
					<div className="flex justify-end gap-2 mt-5">
						<Button
							variant="ghost"
							onClick={() => setShowUnmonitorModal(false)}
							disabled={isUnmonitoring}
						>
							Keep it
						</Button>
						<Button
							variant="danger"
							onClick={confirmUnmonitor}
							disabled={isUnmonitoring}
						>
							{isUnmonitoring && (
								<RefreshCw size={14} className="animate-spin" />
							)}
							Stop monitoring
						</Button>
					</div>
				</div>
			</Modal>
		</>
	);
};

export default MediaCard;
