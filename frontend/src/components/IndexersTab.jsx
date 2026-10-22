import { useState, useEffect, useMemo } from "react";
import {
	AlertTriangle,
	ArrowDown,
	ArrowUp,
	Database,
	ExternalLink,
} from "lucide-react";

import { useToast } from "../context/Toast";
import { apiCall } from "../utils/apiCall";
import { formatSize } from "../utils/formatSize";
import { formatAge, RESULT_SORTS, rankResults } from "../utils/release";

import { Button } from "./Buttons";
import { ui } from "../ui/styles";

const IndexersTab = ({ status, service, serviceId, query, type, mutate }) => {
	const { toast } = useToast();

	const [indexerResults, setIndexerResults] = useState([]);
	const [grabbingId, setGrabbingId] = useState(null);

	const [isLoading, setIsLoading] = useState(!!status);
	const [sort, setSort] = useState("best");
	const rows = useMemo(
		() => rankResults(indexerResults, { sort, type }),
		[indexerResults, sort, type],
	);

	const handleSearchFromIndexers = async () => {
		try {
			setIsLoading(true);
			setIndexerResults([]);
			const { torrents } = await apiCall("/api/v1/missing/deepsearch", {
				method: "POST",
				body: { type, query },
			});
			if (torrents.length === 0) {
				toast.warning("No results found in Indexers");
				return;
			}
			toast.success(`Got ${torrents.length} results from Indexers`);
			setIndexerResults(torrents);
		} catch {
			toast.error("Indexers Search Failed");
			setIndexerResults([]);
		} finally {
			setIsLoading(false);
		}
	};

	const handleGrabFromIndexers = async (item) => {
		try {
			setGrabbingId(item.guid);
			const res = await apiCall("/api/v1/missing/forcegrab", {
				method: "POST",
				body: {
					service,
					serviceId,
					title: item.title,
					downloadUrl: item.downloadUrl,
					protocol: item.protocol === "usenet" ? "usenet" : "torrent",
				},
			});
			if (res.success) {
				setTimeout(() => {
					mutate();
				}, 5000);
				toast.success("Grab From Indexers Started");
			} else {
				toast.error("Grab From Indexers Failed");
			}
		} catch {
			toast.error("Grab From Indexers Failed");
		} finally {
			setGrabbingId(null);
		}
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: later
	useEffect(() => {
		if (status) handleSearchFromIndexers();
	}, []);

	if (!status)
		return (
			<div className="p-6">
				<div className="w-full mb-4 py-3 bg-neg-bg border border-negative/30 rounded-lg flex items-center justify-center gap-3">
					<span className="text-sm font-semibold text-negative">
						Prowlarr is not configured!
					</span>
				</div>
			</div>
		);

	return (
		<div className="p-4 sm:p-6">
			{isLoading ? (
				<div className="w-full mb-4 py-3 bg-raised border border-control rounded-lg flex items-center justify-center gap-3">
					<div className="w-4 h-4 border-2 border-control border-t-ink rounded-full animate-spin" />
					<span className="text-sm font-semibold text-ink">
						Searching Indexers...
					</span>
				</div>
			) : rows.length === 0 ? (
				<div className="text-center py-12 text-faint border-2 border-dashed border-line rounded-2xl">
					<Database size={32} className="mx-auto mb-3 opacity-20" />
					<p>No results found in Indexers.</p>
				</div>
			) : (
				<>
					<div className="flex items-center justify-between gap-2 mb-3">
						<p className="text-xs text-faint num">
							{rows.length} {rows.length === 1 ? "release" : "releases"}
							{rows.length < indexerResults.length &&
								` (${indexerResults.length} results, duplicates merged)`}
						</p>
						<label className="sr-only" htmlFor="results-sort">
							Order
						</label>
						<select
							id="results-sort"
							value={sort}
							onChange={(e) => setSort(e.target.value)}
							className="h-8 pl-3 pr-8 rounded-full bg-raised text-[13px] text-ink border border-transparent focus:outline-none focus:border-control cursor-pointer"
						>
							{RESULT_SORTS.map((o) => (
								<option key={o.id} value={o.id}>
									{o.label}
								</option>
							))}
						</select>
					</div>
					<ul className="space-y-2">
						{rows.map((t) => (
							<ResultRow
								key={t.guid}
								result={t}
								grabbing={grabbingId === t.guid}
								onGrab={() => handleGrabFromIndexers(t)}
							/>
						))}
					</ul>
				</>
			)}
		</div>
	);
};

const Badge = ({ children, strong = false }) => (
	<span
		className={`inline-flex items-center h-5 px-2 rounded-full text-[11px] font-medium ${
			strong ? "bg-ink text-ground" : "bg-raised text-ink"
		}`}
	>
		{children}
	</span>
);

// One release: its name, what the name says (badges), anything wrong with
// it (warnings), then size, peers, grabs, age and where it was found.
const ResultRow = ({ result: t, grabbing, onGrab }) => {
	const p = t.parsed;
	const age = formatAge(t.publishDate);
	const usenet = t.protocol === "usenet";
	const dim = t.warnings.length > 0;

	return (
		<li
			className={`rounded-2xl bg-surface p-3 sm:p-4 transition-colors hover:bg-raised ${dim ? "opacity-70" : ""}`}
		>
			<div className="flex items-start gap-3">
				<div className="min-w-0 flex-1">
					<p
						className="text-sm font-medium text-ink break-all line-clamp-2"
						title={t.title}
					>
						{t.title}
					</p>
					<div className="mt-2 flex flex-wrap items-center gap-1.5">
						{p.resolution && <Badge strong>{p.resolution}</Badge>}
						{p.source && !p.camera && <Badge>{p.source}</Badge>}
						{p.codec && <Badge>{p.codec}</Badge>}
						{p.hdr && <Badge>{p.hdr}</Badge>}
						{p.audio && <Badge>{p.audio}</Badge>}
						{p.multi && <Badge>Multi-audio</Badge>}
						{p.subs && <Badge>Subs</Badge>}
						{t.freeleech && <span className={ui.pillPositive}>Freeleech</span>}
						{t.warnings.map((w) => (
							<span
								key={w}
								className={
									w === "Camera rip" ? ui.pillNegative : ui.pillWarning
								}
							>
								<AlertTriangle size={11} />
								{w}
							</span>
						))}
					</div>
					<p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted num">
						<span className="text-ink font-medium">{formatSize(t.size)}</span>
						{usenet ? (
							<span>Usenet</span>
						) : (
							<span
								className="inline-flex items-center gap-1"
								title={`${t.seeders ?? 0} seeders, ${t.leechers ?? 0} leechers`}
							>
								<ArrowUp
									size={12}
									className={t.seeders > 0 ? "text-positive" : "text-negative"}
								/>
								{t.seeders ?? 0}
								<ArrowDown size={12} className="text-faint ml-1" />
								{t.leechers ?? 0}
							</span>
						)}
						{t.grabs != null && <span>{t.grabs} grabs</span>}
						{age && <span>{age} old</span>}
						<span className="text-faint">{t.indexers.join(", ")}</span>
						{t.infoUrl && (
							<a
								href={t.infoUrl}
								target="_blank"
								rel="noreferrer noopener"
								className="inline-flex items-center gap-1 text-faint hover:text-ink"
								aria-label={`Open ${t.title} on ${t.indexer}`}
							>
								<ExternalLink size={12} />
								Details
							</a>
						)}
					</p>
				</div>
				<Button
					size="sm"
					variant={dim ? "ghost" : "primary"}
					onClick={onGrab}
					disabled={grabbing}
				>
					{grabbing ? "Grabbing…" : "Grab"}
				</Button>
			</div>
		</li>
	);
};

export default IndexersTab;
