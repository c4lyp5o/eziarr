import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Database, Send, FolderOpen, Landmark } from "lucide-react";

import { useToast } from "../context/Toast";
import { apiCall } from "../utils/apiCall";

import IndexersTab from "./IndexersTab";
import TelegramTab from "./TelegramTab";
import InternetArchiveTab from "./InternetArchiveTab";
import OpenDirTab from "./OpenDirTab";

import { Modal } from "./Modal";
import { Tabs } from "./Tabs";

const SOURCES = [
	{ id: "indexers", label: "Indexers", icon: Database },
	{ id: "telegram", label: "Telegram", icon: Send },
	{ id: "archive", label: "Internet Archive", icon: Landmark },
	{ id: "opendir", label: "Open directory", icon: FolderOpen },
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

	const [activeTab, setActiveTab] = useState("indexers"); // indexers | telegram | archive | opendir

	const handleGrabFromWeb = async (url, filename) => {
		try {
			await apiCall("/api/v1/http/import", {
				method: "POST",
				body: { service, serviceId, url, filename },
			});
			toast.success("Download queued");
			setTimeout(() => {
				mutate();
			}, 5000);
		} catch (_err) {
			toast.error("Couldn't queue the download");
		}
	};

	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			labelledBy="deep-search-title"
			title={
				<>
					Deep search <span className="text-muted font-normal">for</span> {query}
				</>
			}
			subtitle="Releases outside your *Arr's own indexers."
		>
			<Tabs id="sources" tabs={SOURCES} active={activeTab} onChange={setActiveTab} />

			<div className="flex-auto min-h-0 h-[62dvh] overflow-y-auto bg-ground">
				<AnimatePresence mode="wait" initial={false}>
					<motion.div
						key={activeTab}
						initial={{ opacity: 0, y: 8 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -6 }}
						transition={{ duration: 0.18 }}
					>
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
					</motion.div>
				</AnimatePresence>
			</div>
		</Modal>
	);
};

export default ResultsModal;
