import { useState, useEffect, useMemo } from "react";
import {
	AnimatePresence,
	LayoutGroup,
	motion,
} from "motion/react";
import {
	RefreshCw,
	Search,
	X,
	Settings as SettingsIcon,
	LogOut,
	Sun,
	Moon,
} from "lucide-react";
import useSWR from "swr";

import { useToast } from "./context/Toast.jsx";
import { useTheme } from "./context/Theme.jsx";
import { apiCall } from "./utils/apiCall.js";
import { ui } from "./ui/styles.js";
import { spring, stagger, tile } from "./ui/motion.js";

import MediaCard from "./components/MediaCard.jsx";
import { describeQueue } from "./utils/queueState.js";
import ResultsModal from "./components/ResultsModal.jsx";
import SettingsModal from "./components/SettingsModal.jsx";
import ErrorScreen from "./components/ErrorScreen.jsx";
import Login from "./components/Login.jsx";
import { Button } from "./components/Buttons.jsx";
import { Mark } from "./components/Mark.jsx";

// Destinations that live in the settings sheet, reachable from the top bar.
const NAV = [
	{ id: "queues", label: "Queue" },
	{ id: "history", label: "History" },
	{ id: "logs", label: "Logs" },
];

const FILTERS = [
	{ id: "all", label: "All missing" },
	{ id: "radarr", label: "Movies" },
	{ id: "sonarr", label: "Episodes" },
	{ id: "lidarr", label: "Albums" },
	{ id: "onTheWay", label: "On the way" },
];

const formatClock = (ts) =>
	ts
		? new Date(ts).toLocaleTimeString(undefined, {
				hour: "2-digit",
				minute: "2-digit",
			})
		: "—";

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

const EmptyFrame = ({ title, children }) => (
	<motion.div
		className="bg-surface rounded-[20px] px-6 py-14 sm:py-20 flex flex-col items-center text-center"
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
	const [scrolled, setScrolled] = useState(false);

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

	useEffect(() => {
		const onScroll = () => setScrolled(window.scrollY > 4);
		window.addEventListener("scroll", onScroll, { passive: true });
		return () => window.removeEventListener("scroll", onScroll);
	}, []);

	const {
		data: sysStatus,
		isLoading: sysStatusIsLoading,
		mutate: mutateSysStatus,
	} = useSWR(authState === "authed" ? "/api/v1/system/status" : null, apiCall);

	// biome-ignore lint/correctness/useExhaustiveDependencies: nop
	useEffect(() => {
		if (authState === "authed" && sysStatus && !sysStatus.isSetup) {
			toast.warning("No services configured yet. Add Radarr, Sonarr or Lidarr to start.");
			setSettingsTab("settings");
		}
	}, [sysStatus]);

	const [syncedAt, setSyncedAt] = useState(null);
	const {
		data: missingMedia,
		error,
		isLoading,
		isValidating,
		mutate,
	} = useSWR(
		authState === "authed" && sysStatus?.isSetup ? "/api/v1/missing" : null,
		apiCall,
		{
			refreshInterval: 10000,
			dedupingInterval: 5000,
			revalidateOnFocus: false,
			onSuccess: () => setSyncedAt(Date.now()),
		},
	);

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
		const c = { all: missing.length, radarr: 0, sonarr: 0, lidarr: 0, onTheWay: 0, stalled: 0 };
		for (const item of missing) {
			if (item.service in c) c[item.service] += 1;
			const state = describeQueue(queueByItem.get(item.id));
			if (state) c.onTheWay += 1;
			if (state?.tone === "warning") c.stalled += 1;
		}
		return c;
	}, [missing, queueByItem]);

	if (authState === "checking") return <div className="min-h-screen bg-ground" />;

	if (authState !== "authed")
		return <Login onLoginSuccess={() => setAuthState("authed")} />;

	if (error) return <ErrorScreen />;

	const q = searchQuery.trim().toLowerCase();
	const filteredItems = missing.filter((item) => {
		const matchesSearch =
			!q ||
			item.title.toLowerCase().includes(q) ||
			item.seriesTitle?.toLowerCase().includes(q);
		const matchesType =
			activeFilter === "all" ||
			(activeFilter === "onTheWay"
				? queueByItem.has(item.id)
				: item.service === activeFilter);
		return matchesSearch && matchesType;
	});

	const loading = isLoading || sysStatusIsLoading;
	const notSetUp = !loading && sysStatus && !sysStatus.isSetup;

	const finding = loading
		? "Syncing your libraries…"
		: counts.all === 0
			? "Nothing missing. Every monitored title is on disk."
			: [
					`${counts.all} ${counts.all === 1 ? "title" : "titles"} missing`,
					`${counts.onTheWay} on the way`,
				].join(" · ");

	return (
		<div className="min-h-screen bg-ground text-ink">
			{/* TOP BAR — mark, destinations, account; one column with the content */}
			<header
				className={`sticky top-0 z-30 bg-ground transition-[border-color] border-b ${
					scrolled ? "border-line" : "border-transparent"
				}`}
			>
				<div className="mx-auto max-w-[1208px] h-14 px-4 sm:px-6 flex items-center gap-2">
					<a href="/" className="flex items-center gap-2 mr-4 shrink-0 text-ink" aria-label="Eziarr home">
						<Mark size={24} />
						<span className="text-base font-semibold tracking-[-0.01em]">Eziarr</span>
					</a>

					<nav className="hidden md:flex items-center gap-1" aria-label="Main">
						<span className="h-9 px-3 inline-flex items-center text-sm font-semibold text-ink" aria-current="page">
							Missing
						</span>
						{NAV.map((n) => (
							<button
								type="button"
								key={n.id}
								onClick={() => setSettingsTab(n.id)}
								className="h-9 px-3 rounded-full text-sm font-semibold text-muted hover:text-ink transition-colors cursor-pointer"
							>
								{n.label}
							</button>
						))}
					</nav>

					<div className="ml-auto flex items-center gap-1">
						{sysStatus?.updateAvailable && (
							<a
								href="https://github.com/c4lyp5o/eziarr/releases/latest"
								target="_blank"
								rel="noreferrer"
								className={`${ui.pillPositive} h-7! px-3! mr-1 hover:brightness-110`}
								title={`Update to v${sysStatus.latestVersion}`}
							>
								v{sysStatus.latestVersion} available
							</a>
						)}
						<Button
							variant="icon"
							onClick={toggleTheme}
							title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
							aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
						>
							<AnimatePresence mode="wait" initial={false}>
								<motion.span
									key={theme}
									initial={{ rotate: -90, opacity: 0, scale: 0.6 }}
									animate={{ rotate: 0, opacity: 1, scale: 1 }}
									exit={{ rotate: 90, opacity: 0, scale: 0.6 }}
									transition={spring}
									className="inline-flex"
								>
									{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
								</motion.span>
							</AnimatePresence>
						</Button>
						<Button
							variant="icon"
							title="Settings"
							aria-label="Settings"
							onClick={() => setSettingsTab("settings")}
						>
							<SettingsIcon size={18} />
						</Button>
						<Button variant="icon" title="Log out" aria-label="Log out" onClick={handleLogout}>
							<LogOut size={18} />
						</Button>
					</div>
				</div>
			</header>

			<main className="mx-auto max-w-[1208px] px-4 sm:px-6 pt-6 pb-24">
				{/* TITLE ROW — the screen's question and today's answer */}
				<div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-5">
					<div className="min-w-0">
						<h1 className="text-xl font-semibold tracking-[-0.01em]">Missing</h1>
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
					</div>

					<div className="flex items-center gap-2">
						<div className="relative flex-1 md:w-72 md:flex-none">
							<Search
								size={15}
								className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint pointer-events-none"
							/>
							<input
								type="search"
								aria-label="Search missing titles"
								placeholder="Search titles"
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className={`${ui.input} pl-9 pr-9 bg-surface border-transparent focus:border-control`}
							/>
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
						<button
							type="button"
							onClick={() => mutate()}
							className="hidden sm:inline-flex items-center gap-2 h-9 px-3 rounded-full whitespace-nowrap text-xs text-faint hover:text-ink hover:bg-surface transition-colors cursor-pointer num"
							title="Refresh now"
						>
							<RefreshCw size={13} className={isValidating ? "animate-spin" : ""} />
							Synced {formatClock(syncedAt)}
						</button>
					</div>
				</div>

				{/* COUNT CARDS — each one is the filter for the wall below */}
				{!notSetUp && (
					<LayoutGroup id="filters">
						<div
							role="tablist"
							aria-label="Filter missing titles"
							className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-5 mb-6"
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
										<span className={`relative text-[13px] ${selected ? "text-ink" : "text-faint"}`}>
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
				) : counts.all === 0 ? (
					<EmptyFrame title="All caught up">
						<p className="text-sm text-muted mt-1">
							Every monitored title is on disk. Eziarr checks again every 10 seconds.
						</p>
					</EmptyFrame>
				) : filteredItems.length === 0 ? (
					<EmptyFrame title="No titles match">
						<p className="text-sm text-muted mt-1">
							{q ? (
								<>
									Nothing called “<span className="text-ink">{searchQuery}</span>”
								</>
							) : (
								"Nothing"
							)}{" "}
							in {FILTERS.find((f) => f.id === activeFilter)?.label.toLowerCase()}.
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
					<motion.ul
						layout
						className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5"
					>
						<AnimatePresence mode="popLayout">
							{filteredItems.map((item, i) => (
								<motion.li
									key={item.id}
									layout
									variants={tile}
									initial="initial"
									animate="animate"
									exit="exit"
									transition={stagger(i)}
								>
									<MediaCard
										item={item}
										queueItem={queueByItem.get(item.id)}
										onSearch={handleTriggerSearch}
										onDeepSearch={() => handleOpenDeepSearch(item)}
										isSearching={searchingId === item.id}
										mutate={mutate}
									/>
								</motion.li>
							))}
						</AnimatePresence>
					</motion.ul>
				)}
			</main>

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

			<SettingsModal
				isOpen={settingsTab !== null}
				initialTab={settingsTab ?? "settings"}
				onClose={() => setSettingsTab(null)}
				onSaveSuccess={mutateSysStatus}
			/>
		</div>
	);
}

export default App;
