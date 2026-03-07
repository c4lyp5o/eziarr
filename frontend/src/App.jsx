import { useState, useEffect } from "react";
import {
	RefreshCw,
	FileWarning,
	Search,
	X,
	Film,
	Tv,
	Music,
	LayoutGrid,
	Settings as SettingsIcon,
} from "lucide-react";
import useSWR from "swr";

import { useToast } from "./context/Toast.jsx";
import { fetcher } from "./utils/fetcher.js";
import { apiCall } from "./utils/apiCall.js";

import MediaCard from "./components/MediaCard.jsx";
import ResultsModal from "./components/ResultsModal.jsx";
import SettingsModal from "./components/SettingsModal.jsx";
import ErrorScreen from "./components/ErrorScreen.jsx";
import { FilterButton, Button } from "./components/Buttons.jsx";

function App() {
	const { toast } = useToast();

	const [searchingId, setSearchingId] = useState(null);
	const [searchQuery, setSearchQuery] = useState("");
	const [activeFilter, setActiveFilter] = useState("all"); // State for tabs: all, radarr, sonarr, lidarr
	const [modalData, setModalData] = useState(null);

	// settings modal
	const [isSettingsOpen, setIsSettingsOpen] = useState(false);

	const { data: sysStatus, mutate: mutateSysStatus } = useSWR(
		"/api/v1/system/status",
		fetcher,
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: nop
	useEffect(() => {
		if (sysStatus && !sysStatus.isSetup) {
			toast.warning("No services configured. Lets get you set up!");
			setIsSettingsOpen(true);
		}
	}, [sysStatus]);

	const {
		data: missingMedia,
		error,
		isLoading,
		mutate,
	} = useSWR(sysStatus?.isSetup ? "/api/v1/missing" : null, fetcher, {
		refreshInterval: 10000,
		dedupingInterval: 5000,
		revalidateOnFocus: false,
	});

	const handleTriggerSearch = async (service, id, itemId) => {
		setSearchingId(itemId);
		try {
			await apiCall("/api/v1/missing/search", {
				method: "POST",
				body: { service, id },
			});
			toast.success(`Search Triggered for ${service} | ${id}`);
			setTimeout(() => {
				mutate();
				setSearchingId(null);
			}, 5000);
		} catch (err) {
			console.error("Search failed", err);
			toast.error("Search failed");
			setSearchingId(null);
		}
	};

	const handleOpenDeepSearch = (item) => {
		let query = item.title;

		// Clean up TV Show queries for better indexer results
		if (item.service === "sonarr" && item.seriesTitle) {
			// Find the SxxExx pattern in the title (e.g., "S01E01")
			const match = item.title.match(/S\d+E\d+/i);
			const seasonEpCode = match ? match[0] : "";

			// Combine cleanly: "Show Name S01E01"
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

	const handleGetQueueItem = (item) => {
		return (missingMedia?.queue || []).find(
			(q) =>
				q.service === item.service &&
				Number(q.serviceId) === Number(item.serviceId),
		);
	};

	const FilterButtons = [
		{
			id: "all",
			label: "All",
			icon: LayoutGrid,
			activeFilter: activeFilter,
			setActiveFilter: setActiveFilter,
		},
		{
			id: "radarr",
			label: "Movies",
			icon: Film,
			activeFilter: activeFilter,
			setActiveFilter: setActiveFilter,
		},
		{
			id: "sonarr",
			label: "TV",
			icon: Tv,
			activeFilter: activeFilter,
			setActiveFilter: setActiveFilter,
		},
		{
			id: "lidarr",
			label: "Music",
			icon: Music,
			activeFilter: activeFilter,
			setActiveFilter: setActiveFilter,
		},
	];

	if (error) return <ErrorScreen />;

	const missing = missingMedia?.missing || [];

	const filteredItems = missing.filter((item) => {
		// 1. Check Text (Title or Series Title)
		const matchesSearch =
			item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
			item.seriesTitle?.toLowerCase().includes(searchQuery.toLowerCase());

		// 2. Check Service Type
		const matchesType = activeFilter === "all" || item.service === activeFilter;

		return matchesSearch && matchesType;
	});

	return (
		<div className="min-h-screen bg-[#0a0a0a] text-gray-100 font-sans selection:bg-indigo-500/30">
			{/* HEADER */}
			<header className="sticky top-0 z-30 bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-white/5 px-6 py-4 mb-8">
				<div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-4 justify-between items-center">
					{/* Logo */}
					<div className="flex items-center gap-3">
						<div className="w-10 h-10 rounded-xl bg-linear-to-tr from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
							<LayoutGrid className="text-white" size={20} />
						</div>
						<div>
							<h1 className="text-xl font-bold tracking-tight text-white leading-none">
								EZIARR
							</h1>
							<p className="text-xs text-gray-500 font-medium">
								*arr Missing Media Manager
							</p>
						</div>
					</div>

					{/* Search & Filter Bar */}
					<div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
						{/* Search Input */}
						<div className="relative group w-full md:w-64">
							<div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500 group-focus-within:text-indigo-400 transition-colors">
								<Search size={16} />
							</div>
							<input
								type="text"
								placeholder="Search titles..."
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className="block w-full pl-10 pr-10 py-2.5 bg-gray-900 border border-gray-800 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all"
							/>
							{searchQuery && (
								<button
									type="button"
									onClick={() => setSearchQuery("")}
									className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-white"
								>
									<X size={14} />
								</button>
							)}
						</div>

						{/* Filter Tabs */}
						<div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
							{FilterButtons.map((btn) => (
								<FilterButton key={btn.id} {...btn} />
							))}
						</div>
					</div>

					{/* DESKTOP STATUS & SETTINGS */}
					<div className="hidden md:flex items-center gap-3">
						<div className="flex items-center gap-2 text-xs font-mono text-gray-500 bg-gray-900 px-3 py-1.5 rounded-lg border border-gray-800">
							<RefreshCw
								size={12}
								className={isLoading ? "animate-spin text-indigo-500" : ""}
							/>
							<span>{isLoading ? "SYNCING..." : "LIVE"}</span>
						</div>

						<Button
							size="sm"
							variant="btnIcon"
							title="Settings"
							onClick={() => setIsSettingsOpen(true)}
						>
							<SettingsIcon size={20} />
						</Button>
					</div>
				</div>
			</header>

			{/* MAIN CONTENT */}
			<main className="max-w-7xl mx-auto pb-24 pl-2 pr-2 md:pb-12">
				{isLoading && missing.length === 0 ? (
					// INITIAL LOADING
					<div className="flex flex-col items-center justify-center py-32 text-gray-500 animate-pulse">
						<RefreshCw
							size={40}
							className="animate-spin mb-4 text-indigo-500"
						/>
						<p className="text-lg font-medium">Syncing libraries...</p>
					</div>
				) : !sysStatus?.isSetup ? (
					<div className="text-center py-32 bg-gray-900/50 border border-gray-800 rounded-2xl border-dashed">
						<div className="inline-flex p-4 rounded-full bg-red-500/10 text-red-400 mb-4">
							<FileWarning size={32} />
						</div>
						<h2 className="text-2xl font-bold text-white mb-2">
							No Services Configured!
						</h2>
						<p className="text-gray-400">
							You haven't set up any services yet! Open Settings to get started.
						</p>
					</div>
				) : missing.length === 0 ? (
					// EMPTY DATABASE
					<div className="text-center py-32 bg-gray-900/50 border border-gray-800 rounded-2xl border-dashed">
						<div className="inline-flex p-4 rounded-full bg-green-500/10 text-green-400 mb-4">
							<RefreshCw size={32} />
						</div>
						<h2 className="text-2xl font-bold text-white mb-2">
							All Caught Up!
						</h2>
						<p className="text-gray-400">Your libraries are 100% complete.</p>
					</div>
				) : filteredItems.length === 0 ? (
					// NO FILTER RESULTS
					<div className="text-center py-20">
						<div className="inline-flex justify-center items-center w-16 h-16 rounded-full bg-gray-800 mb-4">
							<Search size={24} className="text-gray-500" />
						</div>
						<h3 className="text-xl font-semibold text-white">
							No matches found
						</h3>
						<p className="text-gray-400 mt-1">
							No results for "<span className="text-white">{searchQuery}</span>"
							in {activeFilter === "all" ? "all categories" : activeFilter}.
						</p>
						<button
							type="button"
							onClick={() => {
								setSearchQuery("");
								setActiveFilter("all");
							}}
							className="mt-6 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors"
						>
							Clear Filters
						</button>
					</div>
				) : (
					// GRID VIEW
					<>
						<div className="mb-4 text-sm text-gray-500 font-medium">
							Showing {filteredItems.length} missing items
						</div>
						<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
							{filteredItems.map((item) => (
								<MediaCard
									key={item.id}
									item={item}
									queueItem={handleGetQueueItem(item)}
									onSearch={handleTriggerSearch}
									onDeepSearch={() => handleOpenDeepSearch(item)}
									isSearching={searchingId === item.id}
									mutate={mutate}
								/>
							))}
						</div>
					</>
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
					onClose={() => setModalData(null)}
					mutate={mutate}
				/>
			)}

			<SettingsModal
				isOpen={isSettingsOpen}
				onClose={() => setIsSettingsOpen(false)}
				onSaveSuccess={mutateSysStatus}
			/>

			{/* MOBILE STATUS & SETTINGS */}
			<div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0a0a0a]/90 backdrop-blur-xl border-t border-white/5 p-4 flex justify-between items-center shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
				<div className="flex items-center gap-2 text-xs font-mono text-gray-400 bg-gray-900/80 px-3 py-2 rounded-lg border border-gray-800">
					<RefreshCw
						size={14}
						className={isLoading ? "animate-spin text-indigo-500" : ""}
					/>
					<span>{isLoading ? "SYNCING..." : "LIVE"}</span>
				</div>
				<Button
					size="sm"
					variant="btnIcon"
					onClick={() => setIsSettingsOpen(true)}
				>
					<SettingsIcon size={20} />
				</Button>
			</div>
		</div>
	);
}

export default App;
