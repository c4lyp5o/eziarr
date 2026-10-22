import { useState } from "react";
import { Search, RefreshCw, Film, EyeOff, Globe } from "lucide-react";

import { apiCall } from "../utils/apiCall";
import { useToast } from "../context/Toast";
import { describeQueue } from "../utils/queueState";
import { episodeCode, episodeName, isUpcoming } from "../utils/wall";

import { Button } from "./Buttons";
import { Modal } from "./Modal";
import {
	CardShell,
	DOT,
	DownloadRail,
	formatDate,
	formatTimeLeft,
	KIND,
	Poster,
} from "./Poster";

const MediaCard = ({
	item,
	queueItem,
	onSearch,
	onDeepSearch,
	isSearching,
	mutate,
	onUnmonitored,
	selection,
}) => {
	const { toast } = useToast();

	const [showUnmonitorModal, setShowUnmonitorModal] = useState(false);
	const [isUnmonitoring, setIsUnmonitoring] = useState(false);

	const kind = KIND[item.service] ?? { label: item.service, icon: Film };
	const released = formatDate(item.releaseDate);
	const state = describeQueue(queueItem);
	const progress =
		queueItem?.progress == null ? Number.NaN : Number(queueItem.progress);

	const confirmUnmonitor = async () => {
		try {
			setIsUnmonitoring(true);
			onUnmonitored?.(item.id);
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
	const subheading = !item.seriesTitle
		? null
		: item.service === "sonarr"
			? [episodeCode(item.title), episodeName(item)].filter(Boolean).join(" · ")
			: item.title;
	const upcoming = isUpcoming(item);

	return (
		<>
			<CardShell selection={selection} label={heading}>
				<Poster src={item.posterUrl} title={heading} service={item.service}>
					{state && <DownloadRail progress={progress} tone={state.tone} />}
				</Poster>

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
						{upcoming
							? released
								? ` · Out ${released}`
								: " · No date yet"
							: released
								? ` · ${released}`
								: ""}
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
			</CardShell>

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
