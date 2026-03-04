import { useState } from "react";
import { Globe, X, Database, Send, FolderOpen, Landmark } from "lucide-react";

import { useToast } from "../context/Toast";
import { apiCall } from "../utils/apiCall";

import IndexersTab from "./IndexersTab";
import TelegramTab from "./TelegramTab";
import InternetArchiveTab from "./InternetArchiveTab";
import OpenDirTab from "./OpenDirTab";

import { Button } from "./Buttons";

const availableSources = [
	{
		name: "indexers",
		title: "Indexers",
		icon: Database,
		active: "border-indigo-500 text-white",
	},
	{
		name: "telegram",
		title: "Telegram",
		icon: Send,
		active: "border-blue-500 text-white",
	},
	{
		name: "archive",
		title: "Internet Archive",
		icon: Landmark,
		active: "border-yellow-500 text-white",
	},
	{
		name: "opendir",
		title: "Open Directory",
		icon: FolderOpen,
		active: "border-green-500 text-white",
	},
];

const ResultsModal = ({
	sysStatus,
	service,
	serviceId,
	query,
	type,
	isOpen,
	onClose,
	mutate,
}) => {
	const { toast } = useToast();

	const [activeTab, setActiveTab] = useState("indexers"); // indexers | telegram | archive || opendir

	const handleGrabFromWeb = async (url, filename) => {
		try {
			await apiCall("/api/v1/import/http", {
				method: "POST",
				body: { service, serviceId, url, filename },
			});
			toast.success("Grab From Web Started");
			setTimeout(() => {
				mutate();
			}, 5000);
		} catch (err) {
			console.error("Grab From Web Failed", err);
			toast.error("Grab From Web Failed");
		}
	};

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
			<div className="bg-gray-900 border border-gray-700 w-full max-w-4xl max-h-[80vh] rounded-xl flex flex-col shadow-2xl">
				{/* Header */}
				<div className="flex shrink-0 justify-between items-start p-4 sm:p-6 border-b border-gray-800 bg-[#0f0f10] gap-4">
					<div className="flex-1 min-w-0">
						{/* Use items-start so the icon stays at the top of multi-line text */}
						<h2 className="text-lg sm:text-xl font-bold text-white flex items-start gap-2">
							<Globe className="text-indigo-500 shrink-0 mt-0.5" size={20} />

							{/* Wrap the text in a block that forces long strings to break */}
							<div className="break-words min-w-0 leading-tight">
								<span className="mr-2">Deep Search:</span>
								<span className="text-indigo-300">{query}</span>
							</div>
						</h2>

						{/* Added sm:ml-7 to align the subtitle with the text, skipping the icon */}
						<p className="text-xs sm:text-sm text-gray-500 mt-2 sm:ml-7">
							Find releases outside of standard automation.
						</p>
					</div>

					<div className="shrink-0">
						<Button variant="icon" size="sm" onClick={onClose}>
							<X size={20} />
						</Button>
					</div>
				</div>

				{/* Tab Buttons */}
				<div className="flex shrink-0 overflow-x-auto border-b border-gray-800 bg-gray-900/50 px-2 sm:px-6 no-scrollbar scroll-smooth">
					{availableSources.map((src) => (
						<button
							type="button"
							key={src.name}
							onClick={() => setActiveTab(src.name)}
							className={`flex items-center gap-2 py-3 px-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
								activeTab === src.name
									? src.active
									: "border-transparent text-gray-500 hover:text-gray-300"
							}`}
						>
							<src.icon size={16} /> {src.title}
						</button>
					))}
				</div>

				{/* Tabs */}
				<div className="flex-1 overflow-y-auto bg-[#0a0a0a] relative">
					{activeTab === "indexers" && (
						<IndexersTab
							status={sysStatus?.features?.prowlarr}
							service={service}
							serviceId={serviceId}
							query={query}
							type={type}
							mutate={mutate}
						/>
					)}

					{activeTab === "telegram" && (
						<TelegramTab
							status={sysStatus?.features?.telegram}
							service={service}
							serviceId={serviceId}
							query={query}
							mutate={mutate}
						/>
					)}

					{activeTab === "archive" && (
						<InternetArchiveTab query={query} onGrab={handleGrabFromWeb} />
					)}

					{activeTab === "opendir" && (
						<OpenDirTab query={query} onGrab={handleGrabFromWeb} />
					)}
				</div>
			</div>
		</div>
	);
};

export default ResultsModal;
