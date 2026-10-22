import { useState } from "react";
import { EyeOff, Globe, ListVideo, RefreshCw, Search } from "lucide-react";

import { describeQueue } from "../utils/queueState";
import { episodeCode, episodeName, isUpcoming } from "../utils/wall";

import { Button } from "./Buttons";
import { Modal } from "./Modal";
import { CardShell, DOT, DownloadRail, formatDate, Poster } from "./Poster";

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * A series with several missing episodes, as one card. The poster carries a
 * stack edge; the card searches every episode at once and opens the list.
 */
export function SeriesCard({
	group,
	queueByItem,
	onBulk,
	onSearch,
	onDeepSearch,
	searchingId,
	selection,
}) {
	const [open, setOpen] = useState(false);
	const [busy, setBusy] = useState(null); // "search" | "unmonitor" | null
	const [confirmAll, setConfirmAll] = useState(false);

	const { episodes } = group;
	const onTheWay = episodes.filter((e) => queueByItem.has(e.id));
	const lead = onTheWay[0] ? queueByItem.get(onTheWay[0].id) : null;
	const leadState = describeQueue(lead);
	const leadProgress =
		lead?.progress == null ? Number.NaN : Number(lead.progress);
	const first = episodeCode(episodes[0].title);
	const last = episodeCode(episodes[episodes.length - 1].title);

	const run = async (action, items) => {
		setBusy(action);
		try {
			await onBulk(action, items);
		} finally {
			setBusy(null);
		}
	};

	return (
		<>
			<CardShell selection={selection} label={group.title}>
				{/* Two edges peeking above the poster: more than one title here. */}
				<div aria-hidden="true" className="relative">
					<div className="absolute inset-x-4 -top-1.5 h-3 rounded-t-[14px] bg-active" />
					<div className="absolute inset-x-2 -top-0.5 h-3 rounded-t-[14px] bg-control" />
				</div>
				<button
					type="button"
					onClick={() => setOpen(true)}
					className="relative block w-full text-left cursor-pointer rounded-[14px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
					aria-label={`${group.title}: show ${plural(episodes.length, "episode")}`}
				>
					<Poster src={group.posterUrl} title={group.title} service="sonarr">
						<span className="absolute top-2 right-2 h-6 px-2.5 inline-flex items-center rounded-full bg-black/60 text-white text-xs font-semibold num">
							{episodes.length}
						</span>
						{leadState && (
							<DownloadRail progress={leadProgress} tone={leadState.tone} />
						)}
					</Poster>
				</button>

				<div className="flex flex-col gap-0.5 px-1.5 pt-3 pb-1">
					<h3
						className="text-sm font-medium text-ink leading-snug line-clamp-2"
						title={group.title}
					>
						{group.title}
					</h3>
					<p className="text-[13px] text-muted num">
						{plural(episodes.length, "episode")} · {first}–{last}
					</p>
					<p className="text-xs text-faint num">
						{onTheWay.length
							? `${onTheWay.length} on the way`
							: `Series · ${formatDate(episodes[episodes.length - 1].releaseDate, { day: false }) ?? "no date"}`}
					</p>
				</div>

				<div className="mt-auto flex items-center gap-1 px-1 pt-2 min-h-10">
					<Button
						size="sm"
						variant="ghost"
						onClick={() => run("search", episodes)}
						disabled={busy !== null}
						aria-label={`Search all episodes of ${group.title}`}
					>
						{busy === "search" ? (
							<RefreshCw size={14} className="animate-spin" />
						) : (
							<Search size={14} />
						)}
						Search all
					</Button>
					<Button
						variant="icon"
						className="size-8! ml-auto"
						onClick={() => setOpen(true)}
						title="Episodes"
						aria-label={`Show episodes of ${group.title}`}
					>
						<ListVideo size={15} />
					</Button>
				</div>
			</CardShell>

			<Modal
				isOpen={open}
				onClose={() => !busy && setOpen(false)}
				size="md"
				labelledBy={`series-${episodes[0].id}`}
				title={group.title}
				subtitle={`${plural(episodes.length, "missing episode")}${onTheWay.length ? ` · ${onTheWay.length} on the way` : ""}`}
			>
				<ul className="min-h-0 px-3 sm:px-4 pb-2 overflow-y-auto">
					{episodes.map((episode) => {
						const state = describeQueue(queueByItem.get(episode.id));
						const name = episodeName(episode);
						const date = formatDate(episode.releaseDate);
						return (
							<li
								key={episode.id}
								className="flex items-center gap-3 px-2 py-2.5 rounded-2xl hover:bg-raised transition-colors"
							>
								<span className="w-16 shrink-0 text-sm font-medium text-ink num">
									{episodeCode(episode.title)}
								</span>
								<div className="min-w-0 flex-1">
									{name && <p className="text-sm text-ink truncate">{name}</p>}
									<p className="text-xs text-faint num flex items-center gap-1.5">
										{state && (
											<span
												className={`size-1.5 rounded-full ${DOT[state.tone]}`}
											/>
										)}
										{state
											? state.label
											: isUpcoming(episode)
												? `Not out yet${date ? ` · ${date}` : ""}`
												: (date ?? "No air date")}
									</p>
								</div>
								<Button
									variant="icon"
									className="size-8!"
									onClick={() =>
										onSearch(episode.service, episode.serviceId, episode.id)
									}
									disabled={searchingId === episode.id}
									title="Search"
									aria-label={`Search for ${episodeCode(episode.title)}`}
								>
									{searchingId === episode.id ? (
										<RefreshCw size={15} className="animate-spin" />
									) : (
										<Search size={15} />
									)}
								</Button>
								<Button
									variant="icon"
									className="size-8!"
									onClick={() => {
										setOpen(false);
										onDeepSearch(episode);
									}}
									title="Deep search other sources"
									aria-label={`Deep search other sources for ${episodeCode(episode.title)}`}
								>
									<Globe size={15} />
								</Button>
								<Button
									variant="icon"
									className="size-8!"
									onClick={() => run("unmonitor", [episode])}
									disabled={busy !== null}
									title="Stop monitoring"
									aria-label={`Stop monitoring ${episodeCode(episode.title)}`}
								>
									<EyeOff size={15} />
								</Button>
							</li>
						);
					})}
				</ul>
				<div className="flex flex-wrap justify-end gap-2 px-5 sm:px-6 py-4 border-t border-line">
					{confirmAll ? (
						<>
							<p className="text-sm text-muted mr-auto self-center">
								Sonarr stops looking for all {episodes.length}?
							</p>
							<Button variant="ghost" onClick={() => setConfirmAll(false)}>
								Keep them
							</Button>
							<Button
								variant="danger"
								disabled={busy !== null}
								onClick={async () => {
									await run("unmonitor", episodes);
									setConfirmAll(false);
									setOpen(false);
								}}
							>
								{busy === "unmonitor" && (
									<RefreshCw size={14} className="animate-spin" />
								)}
								Stop monitoring all
							</Button>
						</>
					) : (
						<>
							<Button
								variant="ghost"
								className="mr-auto"
								onClick={() => setConfirmAll(true)}
							>
								<EyeOff size={14} />
								Stop monitoring all
							</Button>
							<Button
								onClick={() => run("search", episodes)}
								disabled={busy !== null}
							>
								{busy === "search" ? (
									<RefreshCw size={14} className="animate-spin" />
								) : (
									<Search size={14} />
								)}
								Search all {episodes.length}
							</Button>
						</>
					)}
				</div>
			</Modal>
		</>
	);
}
