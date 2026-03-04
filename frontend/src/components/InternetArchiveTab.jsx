import { useState, useEffect } from "react";
import { Landmark } from "lucide-react";

import { useToast } from "../context/Toast";
import { apiCall } from "../utils/apiCall";

import { ListItem } from "./ListItem";
import { Button } from "./Buttons";
import { ui } from "../ui/styles";

const InternetArchiveTab = ({ query, onGrab }) => {
	const { toast } = useToast();

	const [archiveSearchResults, setArchiveSearchResults] = useState([]);
	const [archiveFiles, setArchiveFiles] = useState({});
	const [expandingId, setExpandingId] = useState(null);
	const [grabbingId, setGrabbingId] = useState(null);

	const [isLoading, setIsLoading] = useState(false);

	const handleSearchFromArchive = async () => {
		try {
			setIsLoading(true);
			setArchiveSearchResults([]);
			const { files } = await apiCall("/api/v1/ia/search", {
				method: "POST",
				body: { query },
			});
			if (files.length === 0) {
				toast.warning("No results found in Internet Archive");
				return;
			}
			toast.success("Internet Archive Search Complete");
			setArchiveSearchResults(files);
		} catch (err) {
			console.error("Internet Archive Search Failed", err);
			toast.error("Internet Archive Search Failed");
			setArchiveSearchResults([]);
		} finally {
			setIsLoading(false);
		}
	};

	const handleArchiveExpand = async (identifier) => {
		if (archiveFiles[identifier]) return;

		try {
			setExpandingId(identifier);
			const { filesInside } = await apiCall(`/api/v1/ia/files/${identifier}`);
			setArchiveFiles((prev) => ({ ...prev, [identifier]: filesInside }));
		} catch (err) {
			console.error("Internet Archive File Fetch Failed", err);
			toast.error("Internet Archive File Fetch Failed");
			setArchiveFiles((prev) => ({ ...prev, [identifier]: [] }));
		} finally {
			setExpandingId(null);
		}
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: l8r
	useEffect(() => {
		handleSearchFromArchive();
	}, []);

	return (
		<div className="p-6">
			{isLoading && (
				<div className="w-full mb-4 py-3 bg-yellow-600/10 border border-yellow-600/30 rounded-lg flex items-center justify-center gap-3 backdrop-blur-sm animate-pulse">
					<div className="w-4 h-4 border-2 border-yellow-500/30 border-t-yellow-500 rounded-full animate-spin" />
					<span className="text-sm font-bold text-yellow-500 tracking-wide">
						Searching Archive.org...
					</span>
				</div>
			)}

			{!isLoading && archiveSearchResults.length === 0 && (
				<div className="text-center py-12 text-gray-500 border-2 border-dashed border-gray-800 rounded-xl">
					<Landmark size={32} className="mx-auto mb-3 opacity-20" />
					<p>No results found in the Archive.</p>
				</div>
			)}

			<div className="space-y-4">
				{archiveSearchResults.map((item) => (
					<div key={item.id} className={ui.card}>
						{/* ITEM HEADER */}
						{/** biome-ignore lint/a11y/noStaticElementInteractions: <explanation> */}
						{/** biome-ignore lint/a11y/useKeyWithClickEvents: <explanation> */}
						<div
							onClick={() => handleArchiveExpand(item.id)}
							className="flex justify-between items-center cursor-pointer group"
						>
							<div>
								<h4 className="font-bold text-gray-200 group-hover:text-indigo-400 transition-colors">
									{item.title}
								</h4>
								<p className="text-xs text-gray-500 mt-1">
									{item.year || "Unknown Year"} • {item.downloads} downloads
								</p>
							</div>
							{expandingId === item.id ? (
								<div className="animate-spin w-4 h-4 border-2 border-yellow-500 rounded-full border-t-transparent" />
							) : (
								<div
									className={`text-gray-500 transition-transform ${archiveFiles[item.id] ? "rotate-180" : ""}`}
								>
									▼
								</div>
							)}
						</div>

						{/* FILES LIST (Expanded) */}
						{archiveFiles[item.id] && (
							<div className="mt-4 pt-4 border-t border-gray-800 space-y-2 bg-black/10 rounded-lg">
								{archiveFiles[item.id].length === 0 ? (
									<p className="text-xs text-center text-gray-600 py-2">
										No video files found.
									</p>
								) : (
									archiveFiles[item.id].map((file) => (
										<ListItem key={file.downloadUrl}>
											<div
												className="truncate text-xs text-gray-300 max-w-[60%]"
												title={file.filename}
											>
												{file.filename}
											</div>
											<div className="flex gap-3 items-center shrink-0">
												<span className="text-[10px] text-gray-500 font-mono uppercase bg-black px-2 py-1 rounded">
													{file.format}
												</span>
												<Button
													variant="success"
													size="sm"
													onClick={async (e) => {
														e.stopPropagation();
														setGrabbingId(file.downloadUrl);
														await onGrab(file.downloadUrl, file.filename);
														setGrabbingId(null);
													}}
													disabled={grabbingId === file.downloadUrl}
												>
													{grabbingId === file.downloadUrl
														? "Grabbing..."
														: "Grab"}
												</Button>
											</div>
										</ListItem>
									))
								)}
							</div>
						)}
					</div>
				))}
			</div>
		</div>
	);
};

export default InternetArchiveTab;
