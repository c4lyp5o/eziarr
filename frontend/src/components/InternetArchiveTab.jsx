import { useState, useEffect } from "react";

import { useToast } from "../context/Toast";

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
			const res = await fetch("/api/v1/ia/search", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query }),
			});
			const iaFiles = await res.json();
			if (iaFiles.length === 0) {
				toast.warning("No results found in Internet Archive");
				return;
			}
			toast.success("Internet Archive Search Complete");
			setArchiveSearchResults(iaFiles);
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
			const res = await fetch(`/api/v1/ia/files/${identifier}`);
			const files = await res.json();
			setArchiveFiles((prev) => ({ ...prev, [identifier]: files }));
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

			<div className="space-y-4">
				{archiveSearchResults.map((item) => (
					<div
						key={item.id}
						className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden"
					>
						{/* Item Header */}
						{/** biome-ignore lint/a11y/noStaticElementInteractions: later */}
						{/** biome-ignore lint/a11y/useKeyWithClickEvents: later */}
						<div
							onClick={() => handleArchiveExpand(item.id)}
							className="p-4 cursor-pointer hover:bg-gray-800 transition-colors flex justify-between items-center"
						>
							<div>
								<h4 className="font-bold text-gray-200">{item.title}</h4>
								<p className="text-xs text-gray-500">
									{item.year || "Unknown Year"} • {item.downloads} downloads
								</p>
							</div>
							{expandingId === item.id ? (
								<div className="animate-spin w-4 h-4 border-2 border-yellow-500 rounded-full border-t-transparent" />
							) : (
								<div className="text-gray-500">▼</div>
							)}
						</div>

						{/* Files List (Expanded) */}
						{archiveFiles[item.id] && (
							<div className="bg-black/50 border-t border-gray-800 p-2 space-y-1">
								{archiveFiles[item.id].length === 0 ? (
									<p className="text-xs text-center text-gray-600 py-2">
										No video files found.
									</p>
								) : (
									archiveFiles[item.id].map((file, idx) => (
										<div
											// biome-ignore lint/suspicious/noArrayIndexKey: later
											key={idx}
											className="flex justify-between items-center p-2 rounded hover:bg-gray-800"
										>
											<div className="truncate text-xs text-gray-400 max-w-[70%]">
												{file.filename}
											</div>
											<div className="flex gap-3 items-center">
												<span className="text-[10px] text-gray-600 uppercase">
													{file.format}
												</span>
												<button
													type="button"
													onClick={async (e) => {
														e.stopPropagation();
														setGrabbingId(file.downloadUrl);
														await onGrab(file.downloadUrl, file.filename);
															setGrabbingId(null);
													}}
													disabled={grabbingId === file.downloadUrl}
													className="text-xs bg-yellow-600/80 hover:bg-yellow-500 px-2 py-1 rounded text-white"
												>
													{grabbingId === file.downloadUrl
														? "Grabbing..."
														: "Grab"}
												</button>
											</div>
										</div>
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
