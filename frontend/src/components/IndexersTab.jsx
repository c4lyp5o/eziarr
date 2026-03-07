import { useState, useEffect } from "react";
import { Database } from "lucide-react";

import { useToast } from "../context/Toast";
import { apiCall } from "../utils/apiCall";
import { formatSize } from "../utils/formatSize";

import { Button } from "./Buttons";
import { ui } from "../ui/styles";

const IndexersTab = ({ status, service, serviceId, query, type, mutate }) => {
	const { toast } = useToast();

	const [indexerResults, setIndexerResults] = useState([]);
	const [grabbingId, setGrabbingId] = useState(null);

	const [isLoading, setIsLoading] = useState(!!status);

	const handleSearchFromIndexers = async () => {
		try {
			setIsLoading(true);
			setIndexerResults([]);
			const { torrents } = await apiCall("/api/v1/missing/deepsearch", {
				method: "POST",
				body: { type, query },
			});
			if (torrents.length === 0) {
				toast.warning("No results found in Indexers");
				return;
			}
			toast.success(`Got ${torrents.length} results from Indexers`);
			setIndexerResults(torrents);
		} catch (err) {
			console.error("Indexers Search Failed", err);
			toast.error("Indexers Search Failed");
			setIndexerResults([]);
		} finally {
			setIsLoading(false);
		}
	};

	const handleGrabFromIndexers = async (item) => {
		try {
			setGrabbingId(item.guid);
			const res = await apiCall("/api/v1/missing/forcegrab", {
				method: "POST",
				body: {
					service,
					serviceId,
					title: item.title,
					downloadUrl: item.downloadUrl,
				},
			});
			if (res.success) {
				setTimeout(() => {
					mutate();
				}, 5000);
				toast.success("Grab From Indexers Started");
			} else {
				toast.error("Grab From Indexers Failed");
			}
		} catch (err) {
			console.error("Grab From Indexers Failed", err);
			toast.error("Grab From Indexers Failed");
		} finally {
			setGrabbingId(null);
		}
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: later
	useEffect(() => {
		if (status) handleSearchFromIndexers();
	}, []);

	if (!status)
		return (
			<div className="p-6">
				<div className="w-full mb-4 py-3 bg-red-600/10 border border-red-500/30 rounded-lg flex items-center justify-center gap-3 backdrop-blur-sm animate-pulse">
					<span className="text-sm font-bold text-red-400 tracking-wide">
						Prowlarr is not configured!
					</span>
				</div>
			</div>
		);

	return (
		<div className="p-6">
			{isLoading ? (
				<div className="w-full mb-4 py-3 bg-indigo-600/10 border border-indigo-500/30 rounded-lg flex items-center justify-center gap-3 backdrop-blur-sm animate-pulse">
					<div className="w-4 h-4 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
					<span className="text-sm font-bold text-indigo-400 tracking-wide">
						Searching Indexers...
					</span>
				</div>
			) : indexerResults.length === 0 ? (
				<div className="text-center py-12 text-gray-500 border-2 border-dashed border-gray-800 rounded-xl">
					<Database size={32} className="mx-auto mb-3 opacity-20" />
					<p>No results found in Indexers.</p>
				</div>
			) : (
				<>
					{/* Mobile */}
					<div className="md:hidden space-y-2">
						{indexerResults.map((t) => (
							<div key={t.guid} className={ui.card}>
								<div className="text-sm font-semibold text-gray-200 truncate">
									{t.title}
								</div>
								<div className="mt-1 flex justify-between text-xs text-gray-500 font-mono">
									<span>{formatSize(t.size)}</span>
									<span>{t.seeders} seeds</span>
								</div>
								<div className="mt-2 flex items-center justify-between">
									<span className="text-xs text-gray-500">{t.indexer}</span>
									<Button
										size="sm"
										variant="success"
										onClick={() => handleGrabFromIndexers(t)}
										disabled={grabbingId === t.guid}
									>
										{grabbingId === t.guid ? "Grabbing..." : "Grab"}
									</Button>
								</div>
							</div>
						))}
					</div>
					{/* Desktop */}
					<div className="hidden md:block">
						<table className="w-full text-left border-collapse">
							<thead>
								<tr className="text-xs font-bold text-gray-500 uppercase border-b border-gray-800">
									<th className="pb-3 pl-2">Title</th>
									<th className="pb-3 text-right">Size</th>
									<th className="pb-3 text-right">Seeds</th>
									<th className="pb-3 text-right">Indexer</th>
									<th className="pb-3 text-right">Action</th>
								</tr>
							</thead>
							<tbody className="text-sm text-gray-300">
								{indexerResults.map((t) => (
									<tr
										key={t.guid}
										className="group border-b border-gray-800/50 hover:bg-gray-800/50 transition-colors"
									>
										<td
											className="py-3 pl-2 max-w-md truncate pr-4"
											title={t.title}
										>
											{t.title}
										</td>
										<td className="py-3 text-right font-mono text-xs">
											{formatSize(t.size)}
										</td>
										<td className="py-3 text-right">
											<Button
												size="sm"
												variant="chip"
												className={
													t.seeders === 0
														? "text-red-300 border-red-500/20 bg-red-500/10"
														: t.seeders < 10
															? "text-yellow-200 border-yellow-500/20 bg-yellow-500/10"
															: "text-emerald-200 border-emerald-500/20 bg-emerald-500/10"
												}
											>
												{t.seeders}
											</Button>
										</td>
										<td className="py-3 text-right text-xs text-gray-500">
											{t.indexer}
										</td>
										<td className="py-3 text-right flex justify-end">
											<Button
												size="sm"
												variant="success"
												onClick={() => handleGrabFromIndexers(t)}
												disabled={grabbingId === t.guid}
											>
												{grabbingId === t.guid ? "Grabbing..." : "Grab"}
											</Button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</>
			)}
		</div>
	);
};

export default IndexersTab;
