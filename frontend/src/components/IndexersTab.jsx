import { useState, useEffect } from "react";
import { Download, Database } from "lucide-react";

import { useToast } from "../context/Toast";

const formatSize = (bytes) => {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
};

const IndexersTab = ({ service, serviceId, query, type, mutate }) => {
	const { toast } = useToast();

	const [indexerResults, setIndexerResults] = useState([]);
	const [grabbingId, setGrabbingId] = useState(null);

	const [isLoading, setIsLoading] = useState(false);

	const handleSearchFromIndexers = async () => {
		try {
			setIsLoading(true);
			setIndexerResults([]);
			const res = await fetch("/api/v1/deepsearch", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ type, query }),
			});
			const torrentsList = await res.json();
			if (torrentsList.length === 0) {
				toast.warning("No results found in Indexers");
				return;
			}
			toast.success(`Got ${torrentsList.length} results from Indexers`);
			setIndexerResults(torrentsList);
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
			const res = await fetch("/api/v1/forcegrab", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					service,
					serviceId,
					title: item.title,
					downloadUrl: item.downloadUrl,
				}),
			});
			const data = await res.json();
			if (data.success) {
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
		handleSearchFromIndexers();
	}, []);

	return (
		<div className="p-6">
			{isLoading ? (
				<div className="flex flex-col items-center justify-center h-64 text-gray-500">
					<Database className="animate-bounce mb-4 text-indigo-500" size={32} />
					<p>Searching indexers...</p>
				</div>
			) : indexerResults.length === 0 ? (
				<div className="text-center py-20 text-gray-500">
					No results found in Prowlarr.
				</div>
			) : (
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
						{indexerResults.map((t, idx) => (
							<tr
								// biome-ignore lint/suspicious/noArrayIndexKey: laterz
								key={idx}
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
								<td
									className={`py-3 text-right font-mono ${t.seeders === 0 ? "text-red-400" : t.seeders > 0 && t.seeders < 10 ? "text-yellow-400" : "text-green-400"}`}
								>
									{t.seeders}
								</td>
								<td className="py-3 text-right text-xs text-gray-500">
									{t.indexer}
								</td>
								<td className="py-3 text-right">
									<button
										type="button"
										onClick={handleGrabFromIndexers}
										disabled={grabbingId === t.guid}
										className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded flex items-center gap-1 ml-auto disabled:opacity-50"
									>
										{grabbingId === t.guid ? (
											"Grabbing..."
										) : (
											<>
												<Download size={12} /> Grab
											</>
										)}
									</button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</div>
	);
};

export default IndexersTab;
