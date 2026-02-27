import { useState } from "react";
import { Globe, X, Database, Send, FolderOpen, Landmark } from "lucide-react";

import { useToast } from "../context/Toast";

import IndexersTab from "./IndexersTab";
import TelegramTab from "./TelegramTab";
import InternetArchiveTab from "./InternetArchiveTab";
import OpenDirTab from "./OpenDirTab";

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

const ResultsModal = ({ service, serviceId, query, type, isOpen, onClose, mutate }) => {
	const { toast } = useToast();

	const [activeTab, setActiveTab] = useState("indexers"); // indexers | telegram | archive || opendir

	const handleGrabFromWeb = async (url, filename) => {
		try {
			const res = await fetch("/api/v1/import/http", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ service, serviceId, url, filename }),
			});
			const data = await res.json();
			if (data.success) {
				toast.success("Grab From Web Started");
			} else {
				toast.error("Grab From Web Failed");
			}
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
				<div className="flex justify-between items-start p-6 border-b border-gray-800 bg-[#0f0f10]">
					<div>
						<h2 className="text-xl font-bold text-white flex items-center gap-2">
							<Globe className="text-indigo-500" size={20} />
							Deep Search:{" "}
							<span className="text-indigo-300 truncate max-w-md">{query}</span>
						</h2>
						<p className="text-sm text-gray-500 mt-1">
							Find releases outside of standard automation.
						</p>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="p-2 hover:bg-gray-800 rounded-full text-gray-400 hover:text-white transition-colors"
					>
						<X size={24} />
					</button>
				</div>

				{/* Tab Buttons */}
				<div className="flex border-b border-gray-800 bg-gray-900/50 px-6">
					{availableSources.map((src) => (
						<button
							type="button"
							key={src.name}
							onClick={() => setActiveTab(src.name)}
							className={`flex items-center gap-2 py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
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
							service={service}
							serviceId={serviceId}
							query={query}
							type={type}
              mutate={mutate}
						/>
					)}

					{activeTab === "telegram" && (
						<TelegramTab
							service={service}
							serviceId={serviceId}
							query={query}
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
