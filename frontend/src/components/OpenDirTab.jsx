import { useState } from "react";
import { FileVideo, Link as LinkIcon, FolderOpen } from "lucide-react";

import { useToast } from "../context/Toast";
import { apiCall } from "../utils/apiCall";

import { Panel } from "./Panel";
import { Button } from "./Buttons";
import { ListItem } from "./ListItem";
import { ui } from "../ui/styles";

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
			const filesFromOpenDir = await apiCall("/api/v1/opendir/scan", {
				method: "POST",
				body: { url: odUrl },
			});
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
			<Panel className="p-4">
				{/** biome-ignore lint/a11y/noLabelWithoutControl: nop */}
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
							className={`${ui.input} pl-10 focus:ring-yellow-500/40 focus:border-yellow-500`}
						/>
					</div>
					<Button
						variant="warn"
						disabled={isLoading}
						onClick={handleSearchFromOd}
					>
						{isLoading ? "Scanning..." : "Scan"}
					</Button>
				</div>
				<p className="text-xs text-gray-600 mt-2">
					Supports standard Apache/Nginx directory listings.
				</p>
			</Panel>

			{/* OD RESULTS */}
			<div className="space-y-2 mt-4">
				{odFiles.length > 0 && (
					<div className="text-xs text-gray-500 mt-2 font-bold uppercase">
						Found {odFiles.length} files
					</div>
				)}

				{odFiles.map((file) => (
					<ListItem key={file.filename}>
						<div className="flex items-center gap-3 overflow-hidden">
							<FileVideo size={18} className="text-gray-500 shrink-0" />
							<div
								className="truncate text-sm text-gray-300"
								title={file.downloadUrl}
							>
								{file.filename}
							</div>
						</div>
						<Button
							size="sm"
							variant="success"
							onClick={async (e) => {
								e.stopPropagation();
								setImportingId(file.downloadUrl);
								await onGrab(file.downloadUrl, file.filename);
								setImportingId(null);
							}}
							disabled={importingId === file.downloadUrl}
						>
							{importingId === file.downloadUrl ? "Grabbing..." : "Grab"}
						</Button>
					</ListItem>
				))}

				{!isLoading && odFiles.length === 0 && (
					<div className="text-center py-12 mt-4 text-gray-500 border-2 border-dashed border-gray-800 rounded-xl">
						<FolderOpen size={32} className="mx-auto mb-3 opacity-20" />
						<p>No files found. Enter a URL and scan.</p>
					</div>
				)}

				{isLoading && (
					<div className="w-full mb-4 py-3 bg-green-600/10 border border-green-600/30 rounded-lg flex items-center justify-center gap-3 backdrop-blur-sm animate-pulse">
						<div className="w-4 h-4 border-2 border-green-500/30 border-t-green-500 rounded-full animate-spin" />
						<span className="text-sm font-bold text-green-500 tracking-wide">
							Scanning folder...
						</span>
					</div>
				)}
			</div>
		</div>
	);
};

export default OpenDirTab;
