import { useState, useEffect } from "react";
import {
	Globe,
	Download,
	X,
	Database,
	Send,
	FileVideo,
	FolderOpen,
	Landmark,
	Link as LinkIcon,
} from "lucide-react";

const ResultsModal = ({
	service,
	serviceId,
	isOpen,
	onClose,
	query,
	type,
	onForceGrab,
}) => {
	const [activeTab, setActiveTab] = useState("indexers"); // indexers | telegram | archive || opendir

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

	// --- INDEXERS ---
	const [indexerResults, setIndexerResults] = useState([]);
	const [loadingIndexers, setLoadingIndexers] = useState(false);
	const [grabbingId, setGrabbingId] = useState(null);

	// --- TELEGRAM ---
	const [telegramConnected, setTelegramConnected] = useState(false);
	const [checkingAuth, setCheckingAuth] = useState(false);

	// Auth Flow
	const [authState, setAuthState] = useState("PHONE"); // PHONE | CODE | PASSWORD
	const [phone, setPhone] = useState("");
	const [code, setCode] = useState("");
	const [password, setPassword] = useState("");

	// Search Flow
	const [channel, setChannel] = useState("");
	const [availableChannels, setAvailableChannels] = useState([]);
	const [telegramResults, setTelegramResults] = useState([]);
	const [loadingTelegram, setLoadingTelegram] = useState(false);
	const [importingId, setImportingId] = useState(null);

	// --- IA ---
	const [archiveResults, setArchiveResults] = useState([]);
	const [archiveFiles, setArchiveFiles] = useState({}); // Map of identifier -> file list
	const [loadingArchive, setLoadingArchive] = useState(false);
	const [expandingId, setExpandingId] = useState(null); // Which item is currently loading files

	// --- OD ---
	const [odUrl, setOdUrl] = useState("");
	const [odFiles, setOdFiles] = useState([]);
	const [loadingOd, setLoadingOd] = useState(false);

	// biome-ignore lint/correctness/useExhaustiveDependencies: later
	useEffect(() => {
		if (isOpen && query) {
			fetchFromIndexers();
			checkTelegramStatus();
		}
	}, [isOpen, query]);

	const fetchFromIndexers = async () => {
		setLoadingIndexers(true);

		try {
			const res = await fetch("/api/v1/deepsearch", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ type, query }),
			});
			const searchResults = await res.json();
			setIndexerResults(searchResults);
		} catch (err) {
			console.error(err);
		} finally {
			setLoadingIndexers(false);
		}
	};

	const checkTelegramStatus = async () => {
		setCheckingAuth(true);
		try {
			const res = await fetch("/api/v1/telegram/status");
			const data = await res.json();
			setTelegramConnected(data.connected);

			if (data.channels) {
				setAvailableChannels(data.channels);
				if (!channel && data.channels.length > 0) {
					setChannel(
						data.channels[0].username
							? `@${data.channels[0].username}`
							: data.channels[0].title,
					);
				}
			}
		} catch {
			setTelegramConnected(false);
		} finally {
			setCheckingAuth(false);
		}
	};

	const handleGrabFromIndexers = async (item) => {
		setGrabbingId(item.guid);
		await onForceGrab(item.title, item.downloadUrl);
		setGrabbingId(null);
		onClose();
	};

	const handleSendCode = async () => {
		try {
			await fetch("/api/v1/telegram/auth/send-code", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ phone }),
			});
			setAuthState("CODE");
		} catch (err) {
			console.error(err);
			alert("Failed to send code");
		}
	};

	const handleLogin = async () => {
		try {
			const res = await fetch("/api/v1/telegram/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ code, password: password || undefined }),
			});
			const data = await res.json();

			if (data.success) {
				setTelegramConnected(true);
			} else if (data.error === "2FA_NEEDED") {
				setAuthState("PASSWORD");
			} else {
				alert(`Login failed: ${data.error}`);
			}
		} catch (err) {
			console.error(err);
			alert("Login failed");
		}
	};

	const handleTelegramSearch = async () => {
		if (!channel)
			return alert("Please enter a channel username (e.g. @SceneReleases)");

		setLoadingTelegram(true);
		try {
			const res = await fetch("/api/v1/telegram/search", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ channel, query }),
			});
			const data = await res.json();
			setTelegramResults(data);
		} catch (err) {
			console.log(err);
			alert("Telegram Search Failed. Is the backend logged in?");
		} finally {
			setLoadingTelegram(false);
		}
	};

	const handleGrabFromTelegram = async (msg) => {
		setImportingId(msg.id);
		try {
			const res = await fetch("/api/v1/telegram/import", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					service,
					serviceId,
					channel,
					messageId: msg.id,
					filename: msg.filename,
				}),
			});
			const data = await res.json();
			if (data.success) {
				alert(`✅ ${data.message}`);
				onClose();
			} else {
				alert(`❌ Import failed: ${data.error}`);
			}
		} catch (err) {
			console.error(err);
			alert("Network Error");
		} finally {
			setImportingId(null);
		}
	};

	const handleArchiveSearch = async () => {
		setLoadingArchive(true);
		try {
			const res = await fetch("/api/v1/ia/search", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query }),
			});
			const data = await res.json();

			if (data.length === 0) {
				alert("No results found");
			}

			setArchiveResults(data);
		} catch (err) {
			console.error(err);
			alert("IA Search Failed");
		} finally {
			setLoadingArchive(false);
		}
	};

	const handleExpandArchive = async (identifier) => {
		if (archiveFiles[identifier]) return;
		setExpandingId(identifier);
		try {
			const res = await fetch(`/api/v1/ia/files/${identifier}`);
			const files = await res.json();
			setArchiveFiles((prev) => ({ ...prev, [identifier]: files }));
		} catch (err) {
			console.error(err);
		} finally {
			setExpandingId(null);
		}
	};

	const handleOdScan = async () => {
		if (!odUrl) return alert("Enter a URL");
		setLoadingOd(true);
		setOdFiles([]); // Clear previous
		try {
			const res = await fetch("/api/v1/opendir/scan", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ url: odUrl }),
			});
			const data = await res.json();
			if (Array.isArray(data)) {
				const regex = new RegExp(
					query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
					"i",
				);
				const filtered = data.filter(
					(file) => regex.test(file.filename) || regex.test(file.url),
				);
				setOdFiles(filtered);
			} else alert("Scan failed");
		} catch (err) {
			console.error(err);
			alert("Scan failed");
		} finally {
			setLoadingOd(false);
		}
	};

	const handleHttpImport = async (url, filename) => {
		setImportingId(url);
		try {
			const res = await fetch("/api/v1/import/http", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ service, serviceId, url, filename }),
			});
			const data = await res.json();
			alert(data.success ? "✅ Download Started" : `❌ ${data.error}`);
		} catch (err) {
			console.error(err);
			alert("Network Error");
		} finally {
			setImportingId(null);
		}
	};

	const formatSize = (bytes) => {
		if (bytes === 0) return "0 B";
		const k = 1024;
		const sizes = ["B", "KB", "MB", "GB", "TB"];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
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

				{/* Tabs */}
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

				{/* Content */}
				<div className="flex-1 overflow-y-auto bg-[#0a0a0a] relative">
					{activeTab === "indexers" && (
						<div className="p-6">
							{loadingIndexers ? (
								<div className="flex flex-col items-center justify-center h-64 text-gray-500">
									<Database
										className="animate-bounce mb-4 text-indigo-500"
										size={32}
									/>
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
										{indexerResults.map((r, i) => (
											<tr
												// biome-ignore lint/suspicious/noArrayIndexKey: laterz
												key={i}
												className="group border-b border-gray-800/50 hover:bg-gray-800/50 transition-colors"
											>
												<td
													className="py-3 pl-2 max-w-md truncate pr-4"
													title={r.title}
												>
													{r.title}
												</td>
												<td className="py-3 text-right font-mono text-xs">
													{formatSize(r.size)}
												</td>
												<td
													className={`py-3 text-right font-mono ${r.seeders === 0 ? "text-red-400" : r.seeders > 0 && r.seeders < 10 ? "text-yellow-400" : "text-green-400"}`}
												>
													{r.seeders}
												</td>
												<td className="py-3 text-right text-xs text-gray-500">
													{r.indexer}
												</td>
												<td className="py-3 text-right">
													<button
														type="button"
														onClick={() => handleGrabFromIndexers(r)}
														disabled={grabbingId === r.guid}
														className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded flex items-center gap-1 ml-auto disabled:opacity-50"
													>
														{grabbingId === r.guid ? (
															"Sending..."
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
					)}

					{activeTab === "telegram" && (
						<div className="p-6">
							{checkingAuth ? (
								<div className="flex justify-center p-12">
									<div className="animate-spin w-8 h-8 border-2 border-blue-500 rounded-full border-t-transparent"></div>
								</div>
							) : !telegramConnected ? (
								// --- LOGIN FORM ---
								<div className="max-w-sm mx-auto bg-gray-900 p-8 rounded-xl border border-gray-800 text-center">
									<div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-400">
										<Send size={24} />
									</div>
									<h3 className="text-lg font-bold text-white mb-6">
										Connect Telegram
									</h3>

									{authState === "PHONE" && (
										<div className="space-y-4">
											<input
												value={phone}
												onChange={(e) => setPhone(e.target.value)}
												placeholder="+1234567890"
												className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white text-center"
											/>
											<button
												type="button"
												onClick={handleSendCode}
												className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg font-bold"
											>
												Send Code
											</button>
										</div>
									)}

									{authState === "CODE" && (
										<div className="space-y-4">
											<input
												value={code}
												onChange={(e) => setCode(e.target.value)}
												placeholder="12345"
												className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white text-center tracking-widest text-lg"
											/>
											<button
												type="button"
												onClick={handleLogin}
												className="w-full bg-green-600 hover:bg-green-500 text-white py-2 rounded-lg font-bold"
											>
												Verify Code
											</button>
										</div>
									)}

									{authState === "PASSWORD" && (
										<div className="space-y-4">
											<p className="text-sm text-yellow-400">
												2FA Password Required
											</p>
											<input
												type="password"
												value={password}
												onChange={(e) => setPassword(e.target.value)}
												placeholder="Cloud Password"
												className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white text-center"
											/>
											<button
												type="button"
												onClick={handleLogin}
												className="w-full bg-purple-600 hover:bg-purple-500 text-white py-2 rounded-lg font-bold"
											>
												Unlock
											</button>
										</div>
									)}
								</div>
							) : (
								// --- CONNECTED: SEARCH UI ---
								<>
									<div className="flex gap-3 mb-6 bg-gray-900/50 p-4 rounded-xl border border-gray-800">
										<div className="flex-1">
											<label className="block text-xs font-bold text-gray-500 uppercase mb-1">
												Target Channel
												<div className="relative">
													<select
														value={channel}
														onChange={(e) => setChannel(e.target.value)}
														className="w-full bg-black border border-gray-700 rounded-lg py-2 pl-3 pr-8 text-white text-sm appearance-none focus:outline-none focus:border-blue-500 transition-all"
													>
														<option value="" disabled>
															Select a channel...
														</option>
														{availableChannels.map((c) => (
															// CHANGE: Use c.id as the value.
															// The backend sends 'id' as a string to avoid BigInt issues in JSON.
															<option key={c.id} value={c.id}>
																{c.title} -{" "}
																{c.username ? `(@${c.username})` : ""} - {c.id}
															</option>
														))}
													</select>
													{/* Dropdown Arrow Icon */}
													<div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-gray-500">
														<svg
															className="w-4 h-4"
															fill="none"
															stroke="currentColor"
															viewBox="0 0 24 24"
														>
															<title>Arrow Down</title>
															<path
																strokeLinecap="round"
																strokeLinejoin="round"
																strokeWidth="2"
																d="M19 9l-7 7-7-7"
															></path>
														</svg>
													</div>
												</div>
											</label>
										</div>
										<div className="flex items-end">
											<button
												type="button"
												onClick={handleTelegramSearch}
												disabled={loadingTelegram}
												className="h-9.5 px-6 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg text-sm flex items-center gap-2"
											>
												{loadingTelegram ? (
													<div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
												) : (
													<Send size={16} />
												)}
												Search
											</button>
										</div>
									</div>

									<div className="space-y-3">
										{telegramResults.length === 0 && !loadingTelegram && (
											<div className="text-center py-12 text-gray-500 border-2 border-dashed border-gray-800 rounded-xl">
												<Send size={32} className="mx-auto mb-3 opacity-20" />
												<p>Search a channel to find media.</p>
											</div>
										)}

										{telegramResults.map((msg) => (
											<div
												key={msg.id}
												className="flex items-center justify-between bg-gray-800/40 border border-gray-700/50 p-4 rounded-xl"
											>
												<div className="flex items-center gap-4 overflow-hidden">
													<div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0 text-blue-400">
														<FileVideo size={20} />
													</div>
													<div className="min-w-0">
														<h4 className="text-sm font-medium text-white truncate pr-4">
															{msg.filename}
														</h4>
														<div className="flex gap-3 text-xs text-gray-400 mt-1">
															<span>{formatSize(msg.size)}</span>
															<span>•</span>
															<span>
																{new Date(msg.date * 1000).toLocaleDateString()}
															</span>
														</div>
													</div>
												</div>

												<button
													type="button"
													onClick={() => handleGrabFromTelegram(msg)}
													disabled={importingId === msg.id}
													className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-xs font-bold disabled:opacity-50"
												>
													{importingId === msg.id ? "Downloading..." : "Import"}
												</button>
											</div>
										))}
									</div>
								</>
							)}
						</div>
					)}

					{activeTab === "archive" && (
						<div className="p-6">
							<button
								type="button"
								onClick={handleArchiveSearch}
								disabled={loadingArchive}
								className="w-full mb-4 py-2 bg-yellow-600/20 text-yellow-500 border border-yellow-600/50 hover:bg-yellow-600/30 rounded font-bold transition-all"
							>
								{loadingArchive
									? "Searching Archive.org..."
									: "Search Internet Archive"}
							</button>

							<div className="space-y-4">
								{archiveResults.map((item) => (
									<div
										key={item.id}
										className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden"
									>
										{/* Item Header */}
										{/** biome-ignore lint/a11y/noStaticElementInteractions: later */}
										{/** biome-ignore lint/a11y/useKeyWithClickEvents: later */}
										<div
											onClick={() => handleExpandArchive(item.id)}
											className="p-4 cursor-pointer hover:bg-gray-800 transition-colors flex justify-between items-center"
										>
											<div>
												<h4 className="font-bold text-gray-200">
													{item.title}
												</h4>
												<p className="text-xs text-gray-500">
													{item.year || "Unknown Year"} • {item.downloads}{" "}
													downloads
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
																	onClick={(e) => {
																		e.stopPropagation();
																		handleHttpImport(
																			file.downloadUrl,
																			file.filename,
																		);
																	}}
																	disabled={importingId === file.downloadUrl}
																	className="text-xs bg-yellow-600/80 hover:bg-yellow-500 px-2 py-1 rounded text-white"
																>
																	{importingId === file.downloadUrl
																		? "..."
																		: "Import"}
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
					)}

					{activeTab === "opendir" && (
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
										onClick={handleOdScan}
										disabled={loadingOd}
										className="px-6 bg-yellow-600 hover:bg-yellow-500 text-black font-bold rounded-lg text-sm transition-colors disabled:opacity-50"
									>
										{loadingOd ? "Scanning..." : "Scan"}
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
												title={file.url}
											>
												{file.filename}
											</div>
										</div>
										<button
											type="button"
											onClick={() => handleHttpImport(file.url, file.filename)}
											disabled={importingId === file.url}
											className="px-3 py-1.5 bg-green-600/20 hover:bg-green-600 text-green-400 hover:text-white border border-green-600/30 rounded text-xs font-bold transition-all disabled:opacity-50"
										>
											{importingId === file.url ? "..." : "Import"}
										</button>
									</div>
								))}

								{odFiles.length === 0 && !loadingOd && (
									<div className="text-center py-10 text-gray-600">
										No video files matching the query found in this directory.
									</div>
								)}
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
};

export default ResultsModal;
