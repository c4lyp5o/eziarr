import { useState } from "react";
import { FileVideo, Link as LinkIcon } from "lucide-react";

import { useToast } from "../context/Toast";

const OpenDirTab = ({ query, onGrab }) => {
	const { toast } = useToast();

	const [odUrl, setOdUrl] = useState("");
	const [odFiles, setOdFiles] = useState([]);
	const [importingId, setImportingId] = useState(null);

	const [isLoading, setIsLoading] = useState(false);

	const handleSearchFromOd = async () => {
		if (!odUrl) return toast.error("Please enter a URL");

		try {
			setIsLoading(true);
			setOdFiles([]);
			const res = await fetch("/api/v1/opendir/scan", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ url: odUrl }),
			});
			const filesFromOpenDir = await res.json();
			if (Array.isArray(filesFromOpenDir)) {
				const regex = new RegExp(
					query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
					"i",
				);
				const filteredFiles = filesFromOpenDir.filter(
					(file) => regex.test(file.filename) || regex.test(file.downloadUrl),
				);

				if (filteredFiles.length === 0) {
					toast.warning("No results found in Open Directory");
					return;
				}
				toast.success(
					`Got ${filteredFiles.length} results from Open Directory`,
				);
				setOdFiles(filteredFiles);
			}
		} catch (err) {
			console.error("Open Directory Scan Failed", err);
			toast.error("Open Directory Scan Failed");
			setOdFiles([]);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="p-6">
			<div className="bg-gray-900/50 p-4 rounded-xl border border-gray-800">
				{/** biome-ignore lint/a11y/noLabelWithoutControl: later */}
				<label className="block text-xs font-bold text-gray-500 uppercase mb-2">
					Directory URL
				</label>
				<div className="flex gap-2">
					<div className="relative flex-1">
						<LinkIcon
							className="absolute left-3 top-2.5 text-gray-500"
							size={16}
						/>
						<input
							value={odUrl}
							onChange={(e) => setOdUrl(e.target.value)}
							placeholder="http://example.com/movies/"
							className="w-full bg-black border border-gray-700 rounded-lg py-2 pl-10 pr-4 text-white text-sm focus:border-yellow-500 transition-colors"
						/>
					</div>
					<button
						type="button"
						onClick={handleSearchFromOd}
						disabled={isLoading}
						className="px-6 bg-yellow-600 hover:bg-yellow-500 text-black font-bold rounded-lg text-sm transition-colors disabled:opacity-50"
					>
						{isLoading ? "Scanning..." : "Scan"}
					</button>
				</div>
				<p className="text-xs text-gray-600 mt-2">
					Supports standard Apache/Nginx directory listings.
				</p>
			</div>

			{/* OD RESULTS */}
			<div className="space-y-2">
				{odFiles.length > 0 && (
					<div className="text-xs text-gray-500 mt-2 font-bold uppercase">
						Found {odFiles.length} files
					</div>
				)}

				{odFiles.map((file, idx) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: later
						key={idx}
						className="flex items-center justify-between bg-gray-800/40 border border-gray-700/50 p-3 rounded-lg hover:border-gray-600 transition-colors"
					>
						<div className="flex items-center gap-3 overflow-hidden">
							<FileVideo size={18} className="text-gray-500 shrink-0" />
							<div
								className="truncate text-sm text-gray-300"
								title={file.downloadUrl}
							>
								{file.filename}
							</div>
						</div>
						<button
							type="button"
							onClick={async (e) => {
								e.stopPropagation();
								setImportingId(file.downloadUrl);
								await onGrab(file.downloadUrl, file.filename);
									setImportingId(null);
							}}
							disabled={importingId === file.downloadUrl}
							className="px-3 py-1.5 bg-green-600/20 hover:bg-green-600 text-green-400 hover:text-white border border-green-600/30 rounded text-xs font-bold transition-all disabled:opacity-50"
						>
							{importingId === file.downloadUrl ? "Grabbing..." : "Grab"}
						</button>
					</div>
				))}

				{odFiles.length === 0 && !isLoading && (
					<div className="text-center py-10 text-gray-600">
						No video files found in this directory.
					</div>
				)}
			</div>
		</div>
	);
};

export default OpenDirTab;
