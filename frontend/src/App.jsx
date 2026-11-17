import {
	useState,
	useEffect,
	useMemo,
	useRef,
	useCallback,
	lazy,
	Suspense,
} from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import {
	RefreshCw,
	Menu,
	Search,
	X,
	LogOut,
	Sun,
	Moon,
	Bell,
	BellOff,
	CheckSquare,
} from "lucide-react";
import useSWR from "swr";

import { useToast } from "./context/Toast.jsx";
import { useTheme } from "./context/Theme.jsx";
import { apiCall } from "./utils/apiCall.js";
import { ui } from "./ui/styles.js";
import { spring } from "./ui/motion.js";

import MediaCard from "./components/MediaCard.jsx";
import { MediaWall } from "./components/MediaWall.jsx";
import { SeriesCard } from "./components/SeriesCard.jsx";
import { BulkBar } from "./components/BulkBar.jsx";
import { useLiveMissing } from "./hooks/useLiveMissing.js";
import { useArrivals } from "./hooks/useArrivals.js";
import { useShortcuts } from "./hooks/useShortcuts.js";
import {
	entryItems,
	groupEpisodes,
	isUpcoming,
	SORTS,
	sortEntries,
} from "./utils/wall.js";
import { describeQueue } from "./utils/queueState.js";
import ErrorScreen from "./components/ErrorScreen.jsx";
import Login from "./components/Login.jsx";
import { Button } from "./components/Buttons.jsx";
import { Mark } from "./components/Mark.jsx";

// The two sheets load on first open: most visits only look at the wall.
const ResultsModal = lazy(() => import("./components/ResultsModal.jsx"));
const SettingsModal = lazy(() => import("./components/SettingsModal.jsx"));
const PosterDrift = lazy(() => import("./components/PosterDrift.jsx"));

const SORT_KEY = "eziarr-sort";
const readSort = () => {
	try {
		const v = localStorage.getItem(SORT_KEY);
		return SORTS.some((s) => s.id === v) ? v : "newest";
	} catch {
		return "newest";
	}
};

const FILTERS = [
	{ id: "all", label: "All missing" },
	{ id: "radarr", label: "Movies" },
	{ id: "sonarr", label: "Episodes" },
	{ id: "lidarr", label: "Albums" },
	{ id: "onTheWay", label: "On the way" },
	{ id: "upcoming", label: "Not out yet" },
];

const SERVICE_NAMES = { radarr: "Radarr", sonarr: "Sonarr", lidarr: "Lidarr" };
const listNames = (services) =>
	services
		.map((s) => SERVICE_NAMES[s] ?? s)
		.join(" and ")
		.replace(/ and (?=.* and )/g, ", ");

// The count changes in place: the old figure lifts out, the new one drops in.
const Count = ({ value }) => (
	<span className="relative inline-flex overflow-hidden num">
		<AnimatePresence mode="popLayout" initial={false}>
			<motion.span
				key={value}
				initial={{ y: "-60%", opacity: 0 }}
				animate={{ y: 0, opacity: 1 }}
				exit={{ y: "60%", opacity: 0 }}
				transition={spring}
			>
				{value}
			</motion.span>
		</AnimatePresence>
	</span>
);

const SkeletonWall = () => (
	<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5">
		{Array.from({ length: 12 }, (_, i) => (
			// biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
			<div key={i} className="bg-surface rounded-[20px] p-2">
				<div className="aspect-2/3 rounded-[14px] bg-raised" />
				<div className="h-3.5 w-4/5 mt-3.5 mx-1.5 rounded bg-raised" />
				<div className="h-3 w-1/2 mt-2 mx-1.5 mb-12 rounded bg-raised" />
			</div>
		))}
	</div>
);

const EmptyFrame = ({ title, bare = false, children }) => (
	<motion.div
		className={`${bare ? "" : "bg-surface"} rounded-[20px] px-6 py-14 sm:py-20 flex flex-col items-center text-center`}
		initial={{ opacity: 0, y: 12 }}
		animate={{ opacity: 1, y: 0 }}
		transition={spring}
	>
		<Mark size={36} className="text-faint mb-5" />
		<h2 className="text-base font-semibold text-ink">{title}</h2>
		{children}
	</motion.div>
);

function App() {
	const { toast } = useToast();
	const { theme, toggle: toggleTheme } = useTheme();

	const [searchingId, setSearchingId] = useState(null);
	const [searchQuery, setSearchQuery] = useState("");
	const [activeFilter, setActiveFilter] = useState("all");
	const [modalData, setModalData] = useState(null);
	const [settingsTab, setSettingsTab] = useState(null); // null = closed
	// Once loaded the sheet stays mounted, so closing it can animate out.
	const [settingsLoaded, setSettingsLoaded] = useState(false);
	if (settingsTab !== null && !settingsLoaded) setSettingsLoaded(true);
	const [navOpen, setNavOpen] = useState(false);
	const [clock, setClock] = useState(Date.now());
	useEffect(() => {
		const timer = setInterval(() => setClock(Date.now()), 15000);
		return () => clearInterval(timer);
	}, []);
	const [sort, setSort] = useState(readSort);
	const [selecting, setSelecting] = useState(false);
	const [selected, setSelected] = useState(() => new Set());
	const searchRef = useRef(null);

	// auth
	const [authState, setAuthState] = useState("checking"); // checking | authed | anon

	const handleLogout = async () => {
		try {
			await apiCall("/api/v1/logout", { method: "POST" });
		} catch {
			// ignore
		}
		setAuthState("anon");
	};

	useEffect(() => {
		let cancelled = false;

		const checkMe = async () => {
			try {
				await apiCall("/api/v1/me");
				if (!cancelled) setAuthState("authed");
			} catch (_err) {
				if (!cancelled) setAuthState("anon");
			}
		};

		checkMe();

		return () => (cancelled = true);
	}, []);

	const {
		data: sysStatus,
		isLoading: sysStatusIsLoading,
		mutate: mutateSysStatus,
	} = useSWR(authState === "authed" ? "/api/v1/system/status" : null, apiCall);

	// biome-ignore lint/correctness/useExhaustiveDependencies: nop
	useEffect(() => {
		if (authState === "authed" && sysStatus && !sysStatus.isSetup) {
			toast.warning(
				"No services configured yet. Add Radarr, Sonarr or Lidarr to start.",
			);
			setSettingsTab("settings");
		}
	}, [sysStatus]);

	const [syncedAt, setSyncedAt] = useState(null);
	const markSynced = useCallback(() => setSyncedAt(Date.now()), []);
	const {
		data: missingMedia,
		error,
		isLoading,
		isValidating,
		mutate,
	} = useLiveMissing(authState === "authed" && sysStatus?.isSetup, {
		onUpdate: markSynced,
	});

	const handleTriggerSearch = async (service, id, itemId) => {
		setSearchingId(itemId);
		try {
			await apiCall("/api/v1/missing/search", {
				method: "POST",
				body: { service, id },
			});
			toast.success(`Asked ${service} to search for it`);
			setTimeout(() => {
				mutate();
				setSearchingId(null);
			}, 5000);
		} catch (_err) {
			toast.error("Search failed");
			setSearchingId(null);
		}
	};

	const handleOpenDeepSearch = (item) => {
		let query = item.title;

		if (item.service === "sonarr" && item.seriesTitle) {
			const match = item.title.match(/S\d+E\d+/i);
			const seasonEpCode = match ? match[0] : "";

			query = `${item.seriesTitle} ${seasonEpCode}`.trim();
		}

		setModalData({
			service: item.service,
			serviceId: item.serviceId,
			query: query,
			type: item.type,
			isOpen: true,
		});
	};

	const missing = useMemo(() => missingMedia?.missing || [], [missingMedia]);
	const queue = useMemo(() => missingMedia?.queue || [], [missingMedia]);
	const unavailable = missingMedia?.unavailable ?? [];

	// One lookup per title: which queue entry (if any) is bringing it in.
	const queueByItem = useMemo(() => {
		const map = new Map();
		for (const item of missing) {
			const q = queue.find(
				(q) =>
					[item.service, "eziarr"].includes(q.service) &&
					Number(q.serviceId) === Number(item.serviceId),
			);
			if (q) map.set(item.id, q);
		}
		return map;
	}, [missing, queue]);

	const counts = useMemo(() => {
		const c = {
			all: missing.length,
			radarr: 0,
			sonarr: 0,
			lidarr: 0,
			onTheWay: 0,
			stalled: 0,
			upcoming: 0,
		};
		for (const item of missing) {
			if (isUpcoming(item)) c.upcoming += 1;
			else if (item.service in c) c[item.service] += 1;
			const state = describeQueue(queueByItem.get(item.id));
			if (state) c.onTheWay += 1;
			if (state?.tone === "warning") c.stalled += 1;
		}
		c.all = missing.length - c.upcoming;
		return c;
	}, [missing, queueByItem]);

	const onArrive = useCallback(
		(name) => toast.success(`${name} downloaded`),
		[toast],
	);
	const {
		notifications,
		toggleNotifications,
		forget: forgetArrivals,
	} = useArrivals({
		missing,
		queueByItem,
		ready: Boolean(missingMedia),
		onArrive,
	});

	const leaveSelection = useCallback(() => {
		setSelecting(false);
		setSelected(new Set());
	}, []);
	const clearSearch = useCallback(() => setSearchQuery(""), []);
	useShortcuts({
		searchRef,
		onClearSearch: clearSearch,
		onEscape: selecting ? leaveSelection : undefined,
	});

	const handleBulk = async (action, items) => {
		if (action === "unmonitor") forgetArrivals(items.map((m) => m.id));
		try {
			const res = await apiCall("/api/v1/missing/bulk", {
				method: "POST",
				body: {
					action,
					items: items.map(({ service, serviceId }) => ({
						service,
						serviceId,
					})),
				},
			});
			(res.success ? toast.success : toast.warning)(res.message);
			mutate();
			return res;
		} catch {
			toast.error(
				action === "search"
					? "Couldn't start the search. Try again."
					: "Couldn't stop monitoring. Try again.",
			);
		}
	};

	// Recomputed only when the list, a filter or the order changes, not on
	// every render: while anything downloads the queue updates every few
	// seconds, and only the "On the way" filter depends on it.
	const queueForFilter = activeFilter === "onTheWay" ? queueByItem : null;
	const { filteredItems, entries } = useMemo(() => {
		const query = searchQuery.trim().toLowerCase();
		const filteredItems = missing.filter((item) => {
			const matchesSearch =
				!query ||
				item.title.toLowerCase().includes(query) ||
				item.seriesTitle?.toLowerCase().includes(query);
			const matchesType = queueForFilter
				? queueForFilter.has(item.id)
				: activeFilter === "upcoming"
					? isUpcoming(item)
					: !isUpcoming(item) &&
						(activeFilter === "all" || item.service === activeFilter);
			return matchesSearch && matchesType;
		});
		return {
			filteredItems,
			entries: sortEntries(groupEpisodes(filteredItems), sort),
		};
	}, [missing, queueForFilter, searchQuery, activeFilter, sort]);

	if (authState === "checking")
		return <div className="min-h-screen bg-ground" />;

	if (authState !== "authed")
		return <Login onLoginSuccess={() => setAuthState("authed")} />;

	if (error) return <ErrorScreen />;

	const q = searchQuery.trim().toLowerCase();
	const selectedItems = selecting
		? missing.filter((m) => selected.has(m.id))
		: [];
	const selectionFor = (items) => {
		if (!selecting) return undefined;
		const all = items.every((m) => selected.has(m.id));
		return {
			selected: all,
			toggle: () =>
				setSelected((prev) => {
					const next = new Set(prev);
					for (const m of items) all ? next.delete(m.id) : next.add(m.id);
					return next;
				}),
		};
	};
	const changeSort = (value) => {
		setSort(value);
		try {
			localStorage.setItem(SORT_KEY, value);
		} catch {
			// Private mode: the order lasts for this visit.
		}
	};

	const loading = isLoading || sysStatusIsLoading;
	const notSetUp = !loading && sysStatus && !sysStatus.isSetup;

	const finding = loading
		? "Syncing your libraries…"
		: missing.length === 0
			? "Nothing missing. Every monitored title is on disk."
			: [
					`${counts.all} ${counts.all === 1 ? "title" : "titles"} missing`,
					`${counts.onTheWay} on the way`,
					...(counts.upcoming ? [`${counts.upcoming} not out yet`] : []),
				].join(" · ");

	return (
		<div className="min-h-screen bg-ground text-ink">
			{/* TOP BAR — mark, destinations, account; one column with the content */}
			{navOpen && (
				<button
					type="button"
					className="ez-nav-backdrop"
					aria-label="Close navigation"
					onClick={() => setNavOpen(false)}
				/>
			)}
			<aside className={`ez-sidebar ${navOpen ? "is-open" : ""}`}>
				<a href="/" className="ez-brand">
					<Mark size={20} />
					<strong>eziarr</strong>
					<span>v{sysStatus?.currentVersion || "…"}</span>
				</a>
				<nav aria-label="Main">
					{[
						{ id: null, label: "Missing media" },
						{ id: "queues", label: "Queue" },
						{ id: "history", label: "History" },
						{ id: "stats", label: "Statistics" },
						{ id: "tasks", label: "Tasks" },
						{ id: "logs", label: "Logs" },
						{ id: "settings", label: "Configuration" },
						{ id: "notifications", label: "Notifications" },
						{ id: "system", label: "System" },
					].map((n) => (
						<button
							type="button"
							key={n.id || "missing"}
							aria-current={settingsTab === n.id ? "page" : undefined}
							onClick={() => {
								setSettingsTab(n.id);
								setNavOpen(false);
							}}
						>
							<span className="ez-nav-label">{n.label}</span>
						</button>
					))}
				</nav>
				<div className="ez-sidebar-footer">
					<a
						href="https://github.com/c4lyp5o/eziarr"
						target="_blank"
						rel="noreferrer"
						aria-label="GitHub"
					>
						<span className="sr-only">GitHub</span>
						<svg
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							aria-hidden="true"
						>
							<path d="M9 19c-5 1-5-3-7-3m14 5v-4c0-1-.3-2-1-2.5 3-.3 6-1.5 6-6A4.6 4.6 0 0 0 20 5c.1-1-.1-2-.5-3-2 0-3 1-4 1.5a13 13 0 0 0-7 0C7.5 3 6 2 4.5 2 4 3 3.8 4 4 5a4.6 4.6 0 0 0-1 3.5c0 4.5 3 5.7 6 6-.6.5-1 1.5-1 2.5v4" />
						</svg>
					</a>
					<Button
						variant="icon"
						onClick={toggleTheme}
						role="switch"
						aria-checked={theme === "dark"}
						aria-label={
							theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
						}
					>
						{theme === "dark" ? <Moon size={18} /> : <Sun size={18} />}
					</Button>
					<Button variant="icon" onClick={handleLogout} aria-label="Log out">
						<LogOut size={18} />
					</Button>
				</div>
			</aside>
			<header className="ez-topbar">
				<button
					type="button"
					className="ez-menu"
					aria-label="Toggle navigation"
					aria-expanded={navOpen}
					onClick={() => setNavOpen(!navOpen)}
				>
					<Menu size={20} />
				</button>
				<span
					className="ez-mobile-brand"
					style={{ visibility: navOpen ? "hidden" : undefined }}
				>
					eziarr
				</span>
				<div className="ml-auto flex items-center gap-2">
					<button
						type="button"
						onClick={() => mutate()}
						disabled={isValidating || !sysStatus?.isSetup}
						className="ez-updated"
						title="Refresh displayed data"
					>
						<RefreshCw
							size={13}
							className={isValidating ? "animate-spin" : ""}
						/>
						{isValidating
							? "Updating…"
							: !syncedAt
								? "Waiting for data"
								: clock - syncedAt < 60000
									? "Updated just now"
									: `Updated ${Math.max(1, Math.floor((clock - syncedAt) / 60000))}m ago`}
					</button>
					<Button
						variant="icon"
						onClick={toggleNotifications}
						disabled={
							notifications === "blocked" || notifications === "unsupported"
						}
						aria-label="Download notifications"
						title="Toggle download notifications"
						aria-pressed={notifications === "on"}
					>
						{notifications === "on" ? (
							<Bell size={18} />
						) : (
							<BellOff size={18} />
						)}
					</Button>
				</div>
			</header>

			{!loading && !notSetUp && missing.length === 0 && (
				<Suspense fallback={null}>
					<PosterDrift mood="calm" />
				</Suspense>
			)}

			<main
				hidden={settingsTab !== null}
				className="ez-content relative px-4 sm:px-6 pt-6 pb-24"
			>
				{/* TITLE ROW — the screen's question and today's answer */}
				<div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-5">
					<div className="min-w-0">
						<h1 className="text-xl font-semibold tracking-[-0.01em]">
							Missing
						</h1>
						<p className="text-sm text-muted mt-1 num">
							{finding}
							{counts.stalled > 0 && (
								<>
									{" · "}
									<button
										type="button"
										onClick={() => setActiveFilter("onTheWay")}
										className="text-warning font-medium hover:underline cursor-pointer"
									>
										{counts.stalled} stalled
									</button>
								</>
							)}
						</p>
						<AnimatePresence initial={false}>
							{unavailable.length > 0 && (
								<motion.p
									className="text-sm text-warning mt-1"
									initial={{ opacity: 0, height: 0 }}
									animate={{ opacity: 1, height: "auto" }}
									exit={{ opacity: 0, height: 0 }}
									transition={spring}
								>
									{listNames(unavailable)}{" "}
									{unavailable.length === 1 ? "isn't" : "aren't"} answering, so{" "}
									{unavailable.length === 1 ? "its" : "their"} downloads may be
									missing below.
								</motion.p>
							)}
						</AnimatePresence>
					</div>

					<div className="flex items-center gap-2">
						<div className="relative flex-1 md:w-72 md:flex-none">
							<Search
								size={15}
								className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint pointer-events-none"
							/>
							<input
								ref={searchRef}
								type="search"
								aria-label="Search missing titles"
								aria-keyshortcuts="/"
								placeholder="Search titles"
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className={`${ui.input} pl-9 pr-9 bg-surface border-transparent focus:border-control`}
							/>
							{!searchQuery && (
								<kbd className="hidden sm:grid absolute right-3 top-1/2 -translate-y-1/2 size-5 place-items-center rounded-md border border-control text-[11px] text-faint pointer-events-none">
									/
								</kbd>
							)}
							<AnimatePresence>
								{searchQuery && (
									<motion.button
										type="button"
										aria-label="Clear search"
										onClick={() => setSearchQuery("")}
										className="absolute right-2 top-1/2 -translate-y-1/2 size-6 grid place-items-center rounded-full text-faint hover:text-ink hover:bg-raised cursor-pointer"
										initial={{ opacity: 0, scale: 0.6 }}
										animate={{ opacity: 1, scale: 1 }}
										exit={{ opacity: 0, scale: 0.6 }}
										transition={spring}
									>
										<X size={13} />
									</motion.button>
								)}
							</AnimatePresence>
						</div>
					</div>
				</div>

				{/* COUNT CARDS — each one is the filter for the wall below */}
				{!notSetUp && (
					<LayoutGroup id="filters">
						<div
							role="tablist"
							aria-label="Filter missing titles"
							className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-3 lg:grid-cols-6 mb-4"
						>
							{FILTERS.map((f) => {
								const selected = activeFilter === f.id;
								return (
									<motion.button
										type="button"
										role="tab"
										aria-selected={selected}
										key={f.id}
										onClick={() => setActiveFilter(f.id)}
										whileTap={{ scale: 0.97 }}
										transition={spring}
										className="relative shrink-0 min-w-32 sm:min-w-0 h-[64px] px-3.5 rounded-2xl bg-surface text-left flex flex-col justify-center cursor-pointer hover:bg-raised transition-colors"
									>
										{selected && (
											<motion.span
												layoutId="filter-selected"
												className="absolute inset-0 rounded-2xl border-[1.5px] border-accent bg-accent/8"
												transition={spring}
											/>
										)}
										<span
											className={`relative text-[13px] ${selected ? "text-ink" : "text-faint"}`}
										>
											{f.label}
										</span>
										<span className="relative text-base font-semibold">
											<Count value={loading ? 0 : counts[f.id]} />
										</span>
									</motion.button>
								);
							})}
						</div>
					</LayoutGroup>
				)}

				{/* WALL TOOLS — order and selection */}
				{!loading && !notSetUp && missing.length > 0 && (
					<div className="flex items-center justify-between gap-2 mb-4">
						<p className="text-xs text-faint num">
							{filteredItems.length === entries.length
								? `${entries.length} shown`
								: `${filteredItems.length} titles in ${entries.length} cards`}
						</p>
						<div className="flex items-center gap-2">
							<label className="sr-only" htmlFor="wall-sort">
								Order
							</label>
							<select
								id="wall-sort"
								value={sort}
								onChange={(e) => changeSort(e.target.value)}
								className="h-8 pl-3 pr-8 rounded-full bg-surface text-[13px] text-ink border border-transparent focus:outline-none focus:border-control cursor-pointer"
							>
								{SORTS.map((o) => (
									<option key={o.id} value={o.id}>
										{o.label}
									</option>
								))}
							</select>
							<Button
								size="sm"
								variant={selecting ? "primary" : "ghost"}
								aria-pressed={selecting}
								onClick={() =>
									selecting ? leaveSelection() : setSelecting(true)
								}
							>
								<CheckSquare size={14} />
								Select
							</Button>
						</div>
					</div>
				)}

				{/* THE WALL */}
				{loading ? (
					<SkeletonWall />
				) : notSetUp ? (
					<EmptyFrame title="No libraries connected yet">
						<p className="text-sm text-muted mt-1 max-w-sm">
							Add Radarr, Sonarr or Lidarr and Eziarr will list everything they
							are still missing.
						</p>
						<Button className="mt-6" onClick={() => setSettingsTab("settings")}>
							Connect a library
						</Button>
					</EmptyFrame>
				) : missing.length === 0 ? (
					<EmptyFrame bare title="All caught up">
						<p className="text-sm text-muted mt-1">
							Every monitored title is on disk. Eziarr checks again every 10
							seconds.
						</p>
					</EmptyFrame>
				) : filteredItems.length === 0 ? (
					<EmptyFrame title="No titles match">
						<p className="text-sm text-muted mt-1">
							{q ? (
								<>
									Nothing called “
									<span className="text-ink">{searchQuery}</span>”
								</>
							) : (
								"Nothing"
							)}{" "}
							in{" "}
							{FILTERS.find((f) => f.id === activeFilter)?.label.toLowerCase()}.
						</p>
						<Button
							variant="ghost"
							className="mt-6"
							onClick={() => {
								setSearchQuery("");
								setActiveFilter("all");
							}}
						>
							Show all missing
						</Button>
					</EmptyFrame>
				) : (
					<MediaWall
						items={entries}
						renderItem={(entry) =>
							entry.group ? (
								<SeriesCard
									group={entry.group}
									queueByItem={queueByItem}
									onBulk={handleBulk}
									onSearch={handleTriggerSearch}
									onDeepSearch={handleOpenDeepSearch}
									searchingId={searchingId}
									selection={selectionFor(entry.group.episodes)}
								/>
							) : (
								<MediaCard
									item={entry.item}
									queueItem={queueByItem.get(entry.item.id)}
									onSearch={handleTriggerSearch}
									onDeepSearch={() => handleOpenDeepSearch(entry.item)}
									isSearching={searchingId === entry.item.id}
									mutate={mutate}
									onUnmonitored={(id) => forgetArrivals([id])}
									selection={selectionFor(entryItems(entry))}
								/>
							)
						}
					/>
				)}
			</main>

			<BulkBar
				open={selecting}
				count={selectedItems.length}
				shown={filteredItems.length}
				onSelectShown={() =>
					setSelected(new Set(filteredItems.map((m) => m.id)))
				}
				onClear={() => setSelected(new Set())}
				onRun={async (action) => {
					const res = await handleBulk(action, selectedItems);
					if (res) leaveSelection();
				}}
				onClose={leaveSelection}
			/>

			<Suspense fallback={null}>
				{modalData && (
					<ResultsModal
						sysStatus={sysStatus}
						service={modalData.service}
						serviceId={modalData.serviceId}
						query={modalData.query}
						type={modalData.type}
						isOpen={modalData.isOpen}
						onClose={() => setModalData((m) => ({ ...m, isOpen: false }))}
						mutate={mutate}
					/>
				)}

				{settingsLoaded && (
					<SettingsModal
						inline
						isOpen={settingsTab !== null}
						initialTab={settingsTab ?? "settings"}
						notifications={notifications}
						toggleNotifications={toggleNotifications}
						systemStatus={sysStatus}
						onClose={() => setSettingsTab(null)}
						onSaveSuccess={mutateSysStatus}
					/>
				)}
			</Suspense>
		</div>
	);
}

export default App;
