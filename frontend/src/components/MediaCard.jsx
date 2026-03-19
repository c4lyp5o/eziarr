import { useState } from "react";
import {
	Search,
	RefreshCw,
	AlertCircle,
	Film,
	Tv,
	Music,
	Download,
	CheckCircle,
	// ExternalLink,
	EyeOff,
	Globe,
} from "lucide-react";

import { apiCall } from "../utils/apiCall";

import { useToast } from "../context/Toast";

const PLACEHOLDER_IMAGE =
	"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='600' viewBox='0 0 400 600'%3E%3Crect fill='%231f2937' width='400' height='600'/%3E%3Ctext fill='%236b7280' font-family='sans-serif' font-size='30' dy='10.5' font-weight='bold' x='50%25' y='50%25' text-anchor='middle'%3ENo Poster%3C/text%3E%3C/svg%3E";

const UnmonitorModal = ({
	isOpen,
	onConfirm,
	onCancel,
	title,
	isProcessing,
}) => {
	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
			<div className="bg-[#0f0f10] border border-red-900/50 w-full max-w-sm rounded-2xl flex flex-col shadow-2xl overflow-hidden text-center">
				<div className="p-6">
					<AlertCircle
						size={48}
						className="mx-auto text-red-500 mb-4 animate-pulse"
					/>
					<h3 className="text-lg font-bold text-white mb-2">
						Stop Monitoring?
					</h3>
					<p className="text-sm text-gray-400">
						Are you sure you want to unmonitor{" "}
						<span className="text-white font-medium">{title}</span>? It will be
						removed from this list.
					</p>
				</div>
				<div className="bg-[#0f0f10] border-t border-gray-800 p-4 flex justify-end gap-3">
					<button
						type="button"
						onClick={onCancel}
						disabled={isProcessing}
						className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors disabled:opacity-50"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={onConfirm}
						disabled={isProcessing}
						className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white px-6 py-2 rounded-lg font-bold text-sm transition-colors disabled:opacity-50"
					>
						{isProcessing ? (
							<>
								<RefreshCw size={16} className="animate-spin" /> Processing...
							</>
						) : (
							"Yes, Unmonitor"
						)}
					</button>
				</div>
			</div>
		</div>
	);
};

const ServiceBadge = ({ service }) => {
	const config = {
		radarr: {
			color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
			icon: Film,
		},
		sonarr: {
			color: "bg-blue-500/20 text-blue-300 border-blue-500/30",
			icon: Tv,
		},
		lidarr: {
			color: "bg-green-500/20 text-green-300 border-green-500/30",
			icon: Music,
		},
	}[service] || { color: "bg-gray-500/20 text-gray-300", icon: AlertCircle };

	const Icon = config.icon;

	return (
		<div
			className={`flex items-center gap-1 px-2 py-1 rounded-md border ${config.color} backdrop-blur-md text-xs font-bold uppercase tracking-wider shadow-sm`}
		>
			<Icon size={12} />
			{service}
		</div>
	);
};

const DownloadStatus = ({ queueItem }) => {
	const isWarning =
		queueItem.status === "warning" || queueItem.status === "error";

	return (
		<div
			className={`w-full p-3 rounded-lg border flex flex-col gap-2 ${
				isWarning
					? "bg-red-500/20 border-red-500/30"
					: "bg-emerald-500/20 border-emerald-500/30"
			}`}
		>
			<div className="flex items-center gap-3">
				<div className="shrink-0">
					{isWarning ? (
						<AlertCircle size={20} className="text-red-400" />
					) : (
						<Download size={20} className="text-emerald-400 animate-pulse" />
					)}
				</div>

				<div className="flex flex-col min-w-0">
					<span className="text-sm font-bold text-white leading-tight truncate capitalize">
						{queueItem.status}
					</span>
					<span className="text-xs text-gray-400 font-mono mt-0.5">
						{queueItem.service === "eziarr"
							? "Downloading..."
							: queueItem.timeleft || "Download stalled"}
					</span>
				</div>
			</div>

			<div className="text-xs text-gray-400 flex justify-between">
				<span>{queueItem.quality || "Unknown"}</span>
				{/* <span className="truncate max-w-25">{queueItem.indexer}</span> */}
			</div>
		</div>
	);
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

	const [imgSrc, setImgSrc] = useState(item.posterUrl || PLACEHOLDER_IMAGE);
	const [showUnmonitorModal, setShowUnmonitorModal] = useState(false);
	const [isUnmonitoring, setIsUnmonitoring] = useState(false);

	const formatDate = (dateString) => {
		if (!dateString) return "Unknown Date";
		return new Date(dateString).toLocaleDateString(undefined, {
			year: "numeric",
			month: "short",
			day: "numeric",
		});
	};

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
			toast.success("Unmonitored successfully");
			setShowUnmonitorModal(false);
			mutate();
		} catch (err) {
			// console.error("Failed to unmonitor", err);
			toast.error("Failed to unmonitor");
		} finally {
			setIsUnmonitoring(false);
		}
	};

	return (
		<>
			<div
				className={`group relative bg-gray-800/50 border rounded-xl overflow-hidden shadow-lg transition-all duration-300 flex flex-col h-full ${
					queueItem
						? "border-emerald-500/40 shadow-emerald-900/20"
						: "border-gray-700/50 hover:border-gray-500"
				}`}
			>
				{/* Image Container */}
				<div className="relative aspect-2/3 overflow-hidden bg-gray-900">
					<img
						src={imgSrc}
						onError={() => setImgSrc(PLACEHOLDER_IMAGE)}
						alt={item.title}
						className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
						loading="lazy"
					/>
					<div className="absolute inset-0 bg-linear-to-t from-gray-900 via-gray-900/60 to-transparent opacity-90"></div>
					<div className="absolute top-3 left-3 flex gap-2">
						<ServiceBadge service={item.service} />
					</div>

					{/* Success Overlay if Downloading */}
					<div className="absolute top-3 right-3 z-10 flex gap-2">
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								setShowUnmonitorModal(true);
							}}
							className="p-1 rounded-md bg-red-500/20 hover:bg-red-500/80 text-red-200 hover:text-white backdrop-blur-md transition-colors"
							title="Stop Monitoring (Ignore)"
						>
							<EyeOff size={12} />
						</button>

						{queueItem && (
							<div className="bg-emerald-500 text-white p-1 rounded-full shadow-lg">
								<CheckCircle size={16} />
							</div>
						)}
					</div>
				</div>

				{/* Content */}
				<div className="absolute bottom-0 left-0 right-0 p-4 flex flex-col gap-1">
					{item.seriesTitle && (
						<p className="text-gray-300 text-xs font-medium tracking-wide uppercase truncate">
							{item.seriesTitle}
						</p>
					)}
					<h3
						className="text-white font-bold text-lg leading-tight line-clamp-2"
						title={item.title}
					>
						{item.title}
					</h3>
					<p className="text-gray-400 text-sm mt-1 mb-2">
						Released:{" "}
						<span className="text-gray-300 font-medium">
							{formatDate(item.releaseDate)}
						</span>
					</p>

					{/* Dynamic Footer: Search Button OR Download Status */}
					<div className="mt-auto pt-2">
						{queueItem ? (
							<DownloadStatus queueItem={queueItem} />
						) : (
							<div className="ml-auto w-fit flex items-center gap-2">
								{/* STANDARD AUTOMATED SEARCH BUTTON */}
								<button
									type="button"
									onClick={() =>
										onSearch(item.service, item.serviceId, item.id)
									}
									disabled={isSearching}
									className={`flex items-center justify-center p-2 rounded-full shadow-lg transition-all backdrop-blur-md border ${
										isSearching
											? "bg-gray-700/50 border-gray-600/30 text-gray-400 cursor-not-allowed"
											: "bg-indigo-600/60 hover:bg-indigo-600/80 border-indigo-500/50 text-white hover:shadow-indigo-500/30 cursor-pointer hover:scale-110"
									}`}
									title={isSearching ? "Searching..." : "Automated Search Now"}
								>
									{isSearching ? (
										<RefreshCw size={20} className="animate-spin" />
									) : (
										<Search size={20} />
									)}
								</button>
								{/* DEEP SEARCH BUTTON */}
								<button
									type="button"
									onClick={(e) => {
										e.stopPropagation();
										onDeepSearch();
									}}
									className={`flex items-center justify-center p-2 rounded-full shadow-lg transition-all backdrop-blur-md border bg-red-950/60 hover:bg-red-900/80 border-red-800/50 text-red-200 hover:shadow-red-900/30 cursor-pointer hover:scale-110 ${
										isSearching
											? "bg-gray-700/50 border-gray-600/30 text-gray-400 cursor-not-allowed"
											: "bg-red-950/60 hover:bg-red-900/80 border-red-800/50 text-red-200 hover:shadow-red-900/30 cursor-pointer hover:scale-110"
									}`}
									title="Deep Search"
								>
									<Globe size={20} />
								</button>
							</div>
						)}
					</div>
				</div>
			</div>
			<UnmonitorModal
				isOpen={showUnmonitorModal}
				title={item.title}
				isProcessing={isUnmonitoring}
				onConfirm={confirmUnmonitor}
				onCancel={() => setShowUnmonitorModal(false)}
			/>
		</>
	);
};

export default MediaCard;
