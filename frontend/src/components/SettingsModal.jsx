import { useState, useEffect, useRef } from "react";
import useSWR from "swr";
import {
	X,
	Save,
	Settings as SettingsIcon,
	Server,
	Send,
	FolderSync,
	Film,
	Tv,
	Search,
	Link,
	AlertTriangle,
	Check,
	Loader2,
	ScrollText,
	Activity,
	RefreshCw,
	CheckCircle2,
	XCircle,
	Clock,
	HardDrive,
	BarChart3,
	ListOrdered,
	History,
} from "lucide-react";

import { useToast } from "../context/Toast";
import { fetcher } from "../utils/fetcher";
import { apiCall } from "../utils/apiCall";
import { formatSize } from "../utils/formatSize";
import { formatDuration } from "../utils/formatDuration";

import { Button } from "./Buttons";
import { ui } from "../ui/styles";

const NoServicesConfiguredModal = ({ handleSave, onCancel, loading }) => {
	return (
		<div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
			<div className="bg-[#0f0f10] border border-red-900/50 w-full max-w-md rounded-2xl flex flex-col shadow-2xl overflow-hidden text-center">
				<div className="p-6">
					<AlertTriangle
						size={48}
						className="mx-auto text-yellow-500 mb-4 animate-pulse"
					/>
					<h3 className="text-lg font-bold text-white mb-2">
						No Services Configured
					</h3>
					<p className="text-sm text-gray-400">
						You haven't configured Radarr, Sonarr, or Lidarr. Eziarr won't be
						able to sync any missing media. Are you sure you want to save?
					</p>
				</div>
				<div className="bg-[#0f0f10] border-t border-gray-800 p-4 flex justify-end gap-3">
					<button
						type="button"
						onClick={onCancel}
						disabled={loading}
						className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors disabled:opacity-50"
					>
						Go Back
					</button>
					<button
						type="button"
						onClick={handleSave}
						disabled={loading}
						className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white px-6 py-2 rounded-lg font-bold text-sm transition-colors disabled:opacity-50"
					>
						{loading ? "Saving..." : "Yes, Save Anyway"}
					</button>
				</div>
			</div>
		</div>
	);
};

const SettingsModal = ({ isOpen, onClose, onSaveSuccess }) => {
	const { toast } = useToast();

	// Tab State
	const [activeTab, setActiveTab] = useState("settings");

	// Live Data States
	const [logType, setLogType] = useState("general");
	const logsEndRef = useRef(null);

	const [settings, setSettings] = useState({
		syncEnabled: true,
		hunterEnabled: true,
		syncInterval: 10,
		hunterInterval: 15,
		telegramApiId: "",
		telegramApiHash: "",
		pathMapRemote: "",
		radarrUrl: "",
		radarrApiKey: "",
		sonarrUrl: "",
		sonarrApiKey: "",
		lidarrUrl: "",
		lidarrApiKey: "",
		prowlarrUrl: "",
		prowlarrApiKey: "",
	});

	const [testStatus, setTestStatus] = useState({
		radarr: "idle",
		sonarr: "idle",
		lidarr: "idle",
		prowlarr: "idle",
	});
	const [noServicesConfiguredPrompt, setNoServicesConfiguredPrompt] =
		useState(false);
	const [loading, setLoading] = useState(false);

	const { data: tasksData, isLoading: taskIsLoading } = useSWR(
		isOpen && activeTab === "tasks" ? "/api/v1/system/tasks" : null,
		fetcher,
		{ refreshInterval: 2000 },
	);

	const { data: queueData, isLoading: queueIsLoading } = useSWR(
		isOpen && activeTab === "queues" ? "/api/v1/downloads/queue" : null,
		fetcher,
		{ refreshInterval: 2000 },
	);

	const { data: historyData, isLoading: historyIsLoading } = useSWR(
		isOpen && activeTab === "history" ? "/api/v1/downloads/history" : null,
		fetcher,
		{ refreshInterval: 2000 },
	);

	const { data: statsData, isLoading: statsIsLoading } = useSWR(
		isOpen && activeTab === "stats" ? "/api/v1/downloads/stats" : null,
		fetcher,
		{ refreshInterval: 2000 },
	);

	const { data: logsData, isLoading: logsIsLoading } = useSWR(
		isOpen && activeTab === "logs"
			? `/api/v1/system/logs?type=${logType}`
			: null,
		fetcher,
		{ refreshInterval: 2000 },
	);

	const tasks = tasksData?.tasks || [];
	const queue = queueData?.queue || [];
	const history = historyData?.history || [];
	const stats = statsData?.stats || [];
	const logs = logsData?.logs || [];

	// biome-ignore lint/correctness/useExhaustiveDependencies: later
	useEffect(() => {
		if (isOpen) {
			fetchSettings();
			setActiveTab("settings");
		}
		return () => setNoServicesConfiguredPrompt(false);
	}, [isOpen]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: later
	useEffect(() => {
		if (activeTab === "logs" && logsEndRef.current) {
			logsEndRef.current.scrollIntoView({ behavior: "smooth" });
		}
	}, [logs, activeTab]);

	const fetchSettings = async () => {
		try {
			const res = await apiCall("/api/v1/settings");
			setSettings((prev) => ({ ...prev, ...res.settings }));
		} catch (err) {
			console.error("Failed to load settings", err);
			toast.error("Failed to load settings");
		}
	};

	const handleTestConnection = async (serviceName) => {
		const url = settings[`${serviceName}Url`];
		const apiKey = settings[`${serviceName}ApiKey`];

		if (!url || !apiKey) {
			toast.error(`Please enter both URL and API Key for ${serviceName}`);
			return;
		}

		setTestStatus((prev) => ({ ...prev, [serviceName]: "loading" }));

		try {
			const res = await apiCall("/api/v1/system/test", {
				method: "POST",
				body: { service: serviceName, url, apiKey },
			});

			if (res.success) {
				setTestStatus((prev) => ({ ...prev, [serviceName]: "success" }));
				toast.success(`${serviceName} connected successfully!`);
			} else {
				setTestStatus((prev) => ({ ...prev, [serviceName]: "error" }));
				toast.error(`${serviceName} connection failed.`);
			}
		} catch (err) {
			setTestStatus((prev) => ({ ...prev, [serviceName]: "error" }));
			toast.error(`Failed to reach ${serviceName}. Check URL.`);
		}

		setTimeout(() => {
			setTestStatus((prev) => ({ ...prev, [serviceName]: "idle" }));
		}, 3000);
	};

	const handleSave = async () => {
		const noServices =
			!settings.radarrUrl &&
			!settings.radarrApiKey &&
			!settings.sonarrUrl &&
			!settings.sonarrApiKey &&
			!settings.lidarrUrl &&
			!settings.lidarrApiKey;

		if (noServices && !noServicesConfiguredPrompt) {
			setNoServicesConfiguredPrompt(true);
			return;
		}

		setLoading(true);
		try {
			await apiCall("/api/v1/settings/batch", {
				method: "POST",
				body: {
					...settings,
					syncEnabled: Boolean(settings.syncEnabled),
					hunterEnabled: Boolean(settings.hunterEnabled),
					syncInterval: Math.max(1, Number(settings.syncInterval) || 1),
					hunterInterval: Math.max(1, Number(settings.hunterInterval) || 1),
				},
			});
			toast.success("Settings saved!");
			setNoServicesConfiguredPrompt(false);
			onSaveSuccess();
		} catch (err) {
			console.error("Failed to save settings", err);
			toast.error("Failed to save settings");
		} finally {
			setLoading(false);
		}
	};

	const handleChange = (e) => {
		const { name, value } = e.target;
		setSettings((prev) => ({ ...prev, [name]: value }));
	};

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
			<div className="bg-[#0f0f10] border border-gray-800 w-full max-w-3xl h-[85vh] rounded-2xl flex flex-col shadow-2xl overflow-hidden">
				{/* HEADER & TABS */}
				<div className="bg-[#0f0f10] border-b border-gray-800 shrink-0">
					<div className="flex justify-between items-center p-6 pb-4">
						<h2 className="text-xl font-bold text-white flex items-center gap-2">
							<Server className="text-indigo-400" size={20} /> System Hub
						</h2>
						<Button variant="icon" size="sm" onClick={onClose}>
							<X size={20} />
						</Button>
					</div>

					{/* Navigation Tabs (Scrollable for smaller screens) */}
					<div className="flex px-6 gap-6 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
						<button
							type="button"
							onClick={() => setActiveTab("settings")}
							className={`pb-3 font-bold text-sm flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
								activeTab === "settings"
									? "border-indigo-500 text-indigo-400"
									: "border-transparent text-gray-500 hover:text-gray-300"
							}`}
						>
							<SettingsIcon size={16} /> Config
						</button>
						<button
							type="button"
							onClick={() => setActiveTab("tasks")}
							className={`pb-3 font-bold text-sm flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
								activeTab === "tasks"
									? "border-emerald-500 text-emerald-400"
									: "border-transparent text-gray-500 hover:text-gray-300"
							}`}
						>
							<Activity size={16} /> Tasks
							{tasks.length > 0 && (
								<span className="bg-emerald-500 text-[#0f0f10] text-[10px] px-1.5 py-0.5 rounded-full animate-pulse">
									{tasks.length}
								</span>
							)}
						</button>
						<button
							type="button"
							onClick={() => setActiveTab("queues")}
							className={`pb-3 font-bold text-sm flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
								activeTab === "queues"
									? "border-blue-500 text-blue-400"
									: "border-transparent text-gray-500 hover:text-gray-300"
							}`}
						>
							<ListOrdered size={16} /> Queue
							{queue.length > 0 && (
								<span className="bg-blue-500 text-[#0f0f10] text-[10px] px-1.5 py-0.5 rounded-full">
									{queue.length}
								</span>
							)}
						</button>
						<button
							type="button"
							onClick={() => setActiveTab("history")}
							className={`pb-3 font-bold text-sm flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
								activeTab === "history"
									? "border-purple-500 text-purple-400"
									: "border-transparent text-gray-500 hover:text-gray-300"
							}`}
						>
							<History size={16} /> History
						</button>
						<button
							type="button"
							onClick={() => setActiveTab("stats")}
							className={`pb-3 font-bold text-sm flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
								activeTab === "stats"
									? "border-orange-500 text-orange-400"
									: "border-transparent text-gray-500 hover:text-gray-300"
							}`}
						>
							<BarChart3 size={16} /> Stats
						</button>
						<button
							type="button"
							onClick={() => setActiveTab("logs")}
							className={`pb-3 font-bold text-sm flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
								activeTab === "logs"
									? "border-zinc-400 text-zinc-300"
									: "border-transparent text-gray-500 hover:text-gray-300"
							}`}
						>
							<ScrollText size={16} /> Logs
						</button>
					</div>
				</div>

				{/* CONTENT AREA */}
				<div className="flex-1 overflow-y-auto p-6 bg-[#0a0a0a] relative">
					{/* ============================== */}
					{/* TAB 1: SETTINGS                */}
					{/* ============================== */}
					{activeTab === "settings" && (
						// ... (Keep your exact Settings tab code here unchanged) ...
						<div className="space-y-8 animate-in fade-in duration-300">
							{/* Section: Worker Intervals */}
							<section>
								<h3 className="text-sm font-bold text-indigo-400 uppercase tracking-wider mb-4 flex items-center gap-2">
									<Server size={16} /> Automation Intervals
								</h3>
								<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
									<div
										className={`bg-gray-900/50 p-4 rounded-xl border border-gray-800 transition-all ${!settings.syncEnabled ? "opacity-60 grayscale-50" : ""}`}
									>
										<div className="flex justify-between items-center mb-3">
											<span className="text-sm font-bold text-gray-200">
												Sync
											</span>
											<button
												type="button"
												onClick={() =>
													setSettings((p) => ({
														...p,
														syncEnabled: !p.syncEnabled,
													}))
												}
												className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${settings.syncEnabled ? "bg-indigo-500" : "bg-gray-700"}`}
											>
												<span
													className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${settings.syncEnabled ? "translate-x-5" : "translate-x-1"}`}
												/>
											</button>
										</div>
										{/** biome-ignore lint/a11y/noLabelWithoutControl: nop */}
										<label className="block text-xs text-gray-400">
											Interval (Minutes)
										</label>
										<input
											type="number"
											name="syncInterval"
											value={settings.syncInterval}
											onChange={handleChange}
											disabled={!settings.syncEnabled}
											min="1"
											className={`${ui.input} mt-1 disabled:opacity-50 disabled:cursor-not-allowed`}
										/>
									</div>

									<div
										className={`bg-gray-900/50 p-4 rounded-xl border border-gray-800 transition-all ${!settings.hunterEnabled ? "opacity-60 grayscale-50" : ""}`}
									>
										<div className="flex justify-between items-center mb-3">
											<span className="text-sm font-bold text-gray-200">
												Hunter
											</span>
											<button
												type="button"
												onClick={() =>
													setSettings((p) => ({
														...p,
														hunterEnabled: !p.hunterEnabled,
													}))
												}
												className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${settings.hunterEnabled ? "bg-indigo-500" : "bg-gray-700"}`}
											>
												<span
													className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${settings.hunterEnabled ? "translate-x-5" : "translate-x-1"}`}
												/>
											</button>
										</div>
										{/** biome-ignore lint/a11y/noLabelWithoutControl: nop */}
										<label className="block text-xs text-gray-400">
											Interval (Minutes)
										</label>
										<input
											type="number"
											name="hunterInterval"
											value={settings.hunterInterval}
											onChange={handleChange}
											disabled={!settings.hunterEnabled}
											min="1"
											className={`${ui.input} mt-1 disabled:opacity-50 disabled:cursor-not-allowed`}
										/>
									</div>
								</div>
							</section>

							{/* Section: Service Connections */}
							<section>
								<div className="mb-4">
									<h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
										<Link size={16} /> Service Connections
									</h3>
									<p className="text-[10px] text-gray-500 mt-1">
										Leave blank if you do not use the service.{" "}
										<strong className="text-gray-400">
											Do not include a trailing slash (/) in URLs.
										</strong>
									</p>
								</div>
								<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
									{/* RADARR */}
									<div className="bg-gray-900/50 p-4 rounded-xl border border-gray-800 focus-within:border-yellow-500/50 transition-colors">
										<div className="flex justify-between items-center mb-3">
											<h4 className="text-sm font-bold text-yellow-500 flex items-center gap-2">
												<Film size={16} /> Radarr
											</h4>
											<button
												type="button"
												onClick={() => handleTestConnection("radarr")}
												disabled={testStatus.radarr === "loading"}
												className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-bold transition-colors ${testStatus.radarr === "success" ? "bg-emerald-500/20 text-emerald-400" : testStatus.radarr === "error" ? "bg-red-500/20 text-red-400" : "bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white"}`}
											>
												{testStatus.radarr === "loading" && (
													<Loader2 size={12} className="animate-spin" />
												)}
												{testStatus.radarr === "success" && <Check size={12} />}
												{testStatus.radarr === "error" && <X size={12} />}
												{testStatus.radarr === "idle" && "Test"}
												{testStatus.radarr !== "idle" &&
													testStatus.radarr !== "loading" &&
													"Tested"}
											</button>
										</div>
										<div className="space-y-3">
											<div>
												{/** biome-ignore lint/a11y/noLabelWithoutControl: nop */}
												<label className="block text-xs text-gray-400">
													URL
												</label>
												<input
													type="text"
													name="radarrUrl"
													value={settings.radarrUrl || ""}
													onChange={handleChange}
													placeholder="http://192.168.1.50:7878"
													className={`${ui.input} mt-1`}
												/>
											</div>
											<div>
												{/** biome-ignore lint/a11y/noLabelWithoutControl: nop */}
												<label className="block text-xs text-gray-400">
													API Key
												</label>
												<input
													type="password"
													name="radarrApiKey"
													value={settings.radarrApiKey || ""}
													onChange={handleChange}
													placeholder="32-character API key"
													className={`${ui.input} mt-1`}
												/>
											</div>
										</div>
									</div>

									{/* SONARR */}
									<div className="bg-gray-900/50 p-4 rounded-xl border border-gray-800 focus-within:border-blue-500/50 transition-colors">
										<div className="flex justify-between items-center mb-3">
											<h4 className="text-sm font-bold text-blue-500 flex items-center gap-2">
												<Tv size={16} /> Sonarr
											</h4>
											<button
												type="button"
												onClick={() => handleTestConnection("sonarr")}
												disabled={testStatus.sonarr === "loading"}
												className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-bold transition-colors ${testStatus.sonarr === "success" ? "bg-emerald-500/20 text-emerald-400" : testStatus.sonarr === "error" ? "bg-red-500/20 text-red-400" : "bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white"}`}
											>
												{testStatus.sonarr === "loading" && (
													<Loader2 size={12} className="animate-spin" />
												)}
												{testStatus.sonarr === "success" && <Check size={12} />}
												{testStatus.sonarr === "error" && <X size={12} />}
												{testStatus.sonarr === "idle" && "Test"}
												{testStatus.sonarr !== "idle" &&
													testStatus.sonarr !== "loading" &&
													"Tested"}
											</button>
										</div>
										<div className="space-y-3">
											<div>
												{/** biome-ignore lint/a11y/noLabelWithoutControl: nop */}
												<label className="block text-xs text-gray-400">
													URL
												</label>
												<input
													type="text"
													name="sonarrUrl"
													value={settings.sonarrUrl || ""}
													onChange={handleChange}
													placeholder="http://192.168.1.50:8989"
													className={`${ui.input} mt-1`}
												/>
											</div>
											<div>
												{/** biome-ignore lint/a11y/noLabelWithoutControl: nop */}
												<label className="block text-xs text-gray-400">
													API Key
												</label>
												<input
													type="password"
													name="sonarrApiKey"
													value={settings.sonarrApiKey || ""}
													onChange={handleChange}
													placeholder="32-character API key"
													className={`${ui.input} mt-1`}
												/>
											</div>
										</div>
									</div>

									{/* LIDARR */}
									<div className="bg-gray-900/50 p-4 rounded-xl border border-gray-800 focus-within:border-green-500/50 transition-colors">
										<div className="flex justify-between items-center mb-3">
											<h4 className="text-sm font-bold text-green-500 flex items-center gap-2">
												<Film size={16} /> Lidarr
											</h4>
											<button
												type="button"
												onClick={() => handleTestConnection("lidarr")}
												disabled={testStatus.lidarr === "loading"}
												className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-bold transition-colors ${testStatus.lidarr === "success" ? "bg-emerald-500/20 text-emerald-400" : testStatus.lidarr === "error" ? "bg-red-500/20 text-red-400" : "bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white"}`}
											>
												{testStatus.lidarr === "loading" && (
													<Loader2 size={12} className="animate-spin" />
												)}
												{testStatus.lidarr === "success" && <Check size={12} />}
												{testStatus.lidarr === "error" && <X size={12} />}
												{testStatus.lidarr === "idle" && "Test"}
												{testStatus.lidarr !== "idle" &&
													testStatus.lidarr !== "loading" &&
													"Tested"}
											</button>
										</div>
										<div className="space-y-3">
											<div>
												{/** biome-ignore lint/a11y/noLabelWithoutControl: nop */}
												<label className="block text-xs text-gray-400">
													URL
												</label>
												<input
													type="text"
													name="lidarrUrl"
													value={settings.lidarrUrl || ""}
													onChange={handleChange}
													placeholder="http://192.168.1.50:8686"
													className={`${ui.input} mt-1`}
												/>
											</div>
											<div>
												{/** biome-ignore lint/a11y/noLabelWithoutControl: nop */}
												<label className="block text-xs text-gray-400">
													API Key
												</label>
												<input
													type="password"
													name="lidarrApiKey"
													value={settings.lidarrApiKey || ""}
													onChange={handleChange}
													placeholder="32-character API key"
													className={`${ui.input} mt-1`}
												/>
											</div>
										</div>
									</div>
								</div>
							</section>

							{/* Section: Prowlarr Connection */}
							<section>
								<h3 className="text-sm font-bold text-orange-400 uppercase tracking-wider mb-4 flex items-center gap-2">
									<Search size={16} /> Prowlarr
								</h3>
								<div className="space-y-3 bg-gray-900/50 p-4 rounded-xl border border-gray-800">
									<div>
										{/** biome-ignore lint/a11y/noLabelWithoutControl: nop */}
										<label className="block text-xs text-gray-400">URL</label>
										<input
											type="text"
											name="prowlarrUrl"
											value={settings.prowlarrUrl}
											onChange={handleChange}
											placeholder="http://192.168.1.50:9696"
											className={`${ui.input} mt-1`}
										/>
									</div>
									<div>
										{/** biome-ignore lint/a11y/noLabelWithoutControl: nop */}
										<label className="block text-xs text-gray-400">
											API Key
										</label>
										<input
											type="text"
											name="prowlarrApiKey"
											value={settings.prowlarrApiKey}
											onChange={handleChange}
											placeholder="32-character API key"
											className={`${ui.input} mt-1`}
										/>
									</div>
								</div>
							</section>

							{/* Section: Telegram Credentials */}
							<section>
								<h3 className="text-sm font-bold text-blue-400 uppercase tracking-wider mb-4 flex items-center gap-2">
									<Send size={16} /> Telegram MTProto
								</h3>
								<div className="space-y-3 bg-gray-900/50 p-4 rounded-xl border border-gray-800">
									<div>
										{/** biome-ignore lint/a11y/noLabelWithoutControl: nop */}
										<label className="block text-xs text-gray-400">
											API ID
										</label>
										<input
											type="text"
											name="telegramApiId"
											value={settings.telegramApiId}
											onChange={handleChange}
											placeholder="e.g. 12345678"
											className={`${ui.input} mt-1`}
										/>
									</div>
									<div>
										{/** biome-ignore lint/a11y/noLabelWithoutControl: nop */}
										<label className="block text-xs text-gray-400">
											API Hash
										</label>
										<input
											type="password"
											name="telegramApiHash"
											value={settings.telegramApiHash}
											onChange={handleChange}
											placeholder="Your 32-char hash"
											className={`${ui.input} mt-1`}
										/>
									</div>
									<p className="text-[10px] text-gray-500">
										Get these from my.telegram.org.
									</p>
								</div>
							</section>

							{/* Section: Path Mapping */}
							<section>
								<h3 className="text-sm font-bold text-yellow-400 uppercase tracking-wider mb-4 flex items-center gap-2">
									<FolderSync size={16} /> Path Translation (Optional)
								</h3>
								<div className="space-y-3 bg-gray-900/50 p-4 rounded-xl border border-gray-800">
									<div>
										{/** biome-ignore lint/a11y/noLabelWithoutControl: nop */}
										<label className="block text-xs text-gray-400">
											*Arr Remote Path (Host Prefix)
										</label>
										<input
											type="text"
											name="pathMapRemote"
											value={settings.pathMapRemote}
											onChange={handleChange}
											placeholder="C:\Imports"
											className={`${ui.input} mt-1`}
										/>
									</div>
									<p className="text-[10px] text-gray-500">
										Leave blank if Eziarr and *Arr apps are on the same
										machine/filesystem.
									</p>
								</div>
							</section>
						</div>
					)}

					{/* ============================== */}
					{/* TAB 2: TASKS                   */}
					{/* ============================== */}
					{activeTab === "tasks" && (
						<div className="animate-in fade-in duration-300 h-full flex flex-col">
							{tasks.length === 0 && !taskIsLoading ? (
								<div className="flex flex-col items-center justify-center flex-1 text-center text-gray-500">
									<Activity
										size={48}
										className="mb-4 opacity-50 text-emerald-500"
									/>
									<h3 className="text-lg font-bold text-gray-300">
										No Active Tasks
									</h3>
									<p className="text-sm mt-2 max-w-sm">
										Eziarr is currently idle.
									</p>
								</div>
							) : taskIsLoading ? (
								<div className="flex flex-col items-center justify-center flex-1 text-center text-gray-500">
									<Loader2
										size={48}
										className="mb-4 opacity-50 text-emerald-500 animate-spin"
									/>
									<h3 className="text-lg font-bold text-gray-300">
										Loading tasks...
									</h3>
								</div>
							) : (
								<div className="space-y-3">
									{tasks.map((task) => (
										<div
											key={task.id}
											className="bg-gray-900/50 border border-emerald-900/30 p-4 rounded-xl flex items-center gap-4 animate-in slide-in-from-bottom-2"
										>
											<div className="bg-emerald-500/10 p-2 rounded-lg">
												<RefreshCw
													className="text-emerald-400 animate-spin"
													size={20}
												/>
											</div>
											<div className="flex-1 min-w-0">
												<div className="flex justify-between items-center mb-1">
													<h4 className="font-bold text-gray-200 text-sm flex items-center gap-2 capitalize">
														{task.type}
													</h4>
													<span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">
														{new Date(task.updated_at).toLocaleTimeString()}
													</span>
												</div>
												<p className="text-xs text-gray-400 truncate">
													{task.message}
												</p>
												{task.progress > 0 && task.progress < 100 && (
													<div className="w-full bg-gray-800 rounded-full h-1.5 mt-2 overflow-hidden">
														<div
															className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300 ease-out"
															style={{ width: `${task.progress}%` }}
														></div>
													</div>
												)}
											</div>
										</div>
									))}
								</div>
							)}
						</div>
					)}

					{/* ============================== */}
					{/* TAB 3: DOWNLOAD QUEUES         */}
					{/* ============================== */}
					{activeTab === "queues" && (
						<div className="animate-in fade-in duration-300 h-full flex flex-col">
							{queue.length === 0 && !queueIsLoading ? (
								<div className="flex flex-col items-center justify-center flex-1 text-center text-gray-500">
									<ListOrdered
										size={48}
										className="mb-4 opacity-50 text-blue-500"
									/>
									<h3 className="text-lg font-bold text-gray-300">
										No Downloads Queued
									</h3>
									<p className="text-sm mt-2 max-w-sm">
										The background queue is completely clear.
									</p>
								</div>
							) : queueIsLoading ? (
								<div className="flex flex-col items-center justify-center flex-1 text-center text-gray-500">
									<Loader2
										size={48}
										className="mb-4 opacity-50 text-blue-500 animate-spin"
									/>
									<h3 className="text-lg font-bold text-gray-300">
										Loading download queue...
									</h3>
								</div>
							) : (
								<div className="space-y-3">
									{queue.map((q) => {
										let payloadObj = {};
										try {
											payloadObj = JSON.parse(q.payload);
										} catch (e) {}
										return (
											<div
												key={q.id}
												className="bg-gray-900/50 border border-gray-800 p-4 rounded-xl flex items-center gap-4 animate-in slide-in-from-bottom-2"
											>
												<div
													className={`p-2 rounded-lg ${q.status === "downloading" ? "bg-blue-500/10 text-blue-400" : q.status === "retry" ? "bg-yellow-500/10 text-yellow-400" : "bg-gray-800 text-gray-400"}`}
												>
													{q.status === "downloading" ? (
														<RefreshCw className="animate-spin" size={20} />
													) : (
														<Clock size={20} />
													)}
												</div>
												<div className="flex-1 min-w-0">
													<div className="flex justify-between items-center mb-1">
														<div className="flex items-center gap-2">
															<h4 className="font-bold text-gray-200 text-sm capitalize">
																{q.type} Queue
															</h4>
															<span
																className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${q.status === "downloading" ? "bg-blue-500/20 text-blue-400" : q.status === "retry" ? "bg-yellow-500/20 text-yellow-400" : "bg-gray-800 text-gray-400"}`}
															>
																{q.status}
															</span>
														</div>
														<span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider shrink-0">
															Added:{" "}
															{new Date(q.created_at).toLocaleTimeString([], {
																hour: "2-digit",
																minute: "2-digit",
															})}
														</span>
													</div>
													<p className="text-xs text-gray-400 truncate mt-1">
														{payloadObj.filename || "Processing Metadata..."}
													</p>
													{q.status === "retry" && q.last_error && (
														<p className="text-[10px] text-yellow-500/80 mt-2">
															Will retry at{" "}
															{new Date(q.next_attempt).toLocaleTimeString()}.
															Reason: {q.last_error}
														</p>
													)}
												</div>
											</div>
										);
									})}
								</div>
							)}
						</div>
					)}

					{/* ============================== */}
					{/* TAB 4: DOWNLOAD HISTORY        */}
					{/* ============================== */}
					{activeTab === "history" && (
						<div className="animate-in fade-in duration-300 h-full flex flex-col">
							{history.length === 0 && !historyIsLoading ? (
								<div className="flex flex-col items-center justify-center flex-1 text-center text-gray-500">
									<History
										size={48}
										className="mb-4 opacity-50 text-purple-500"
									/>
									<h3 className="text-lg font-bold text-gray-300">
										No Download History
									</h3>
									<p className="text-sm mt-2 max-w-sm">
										Past downloads will be logged here.
									</p>
								</div>
							) : historyIsLoading ? (
								<div className="flex flex-col items-center justify-center flex-1 text-center text-gray-500">
									<Loader2
										size={48}
										className="mb-4 opacity-50 text-purple-500 animate-spin"
									/>
									<h3 className="text-lg font-bold text-gray-300">
										Loading history...
									</h3>
								</div>
							) : (
								<div className="space-y-3">
									{history.map((h) => (
										<div
											key={h.id}
											className="bg-gray-900/50 border border-gray-800 p-4 rounded-xl flex items-center gap-4 animate-in slide-in-from-bottom-2"
										>
											<div
												className={`p-2 rounded-lg shrink-0 ${h.status === "completed" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}
											>
												{h.status === "completed" ? (
													<CheckCircle2 size={20} />
												) : (
													<XCircle size={20} />
												)}
											</div>
											<div className="flex-1 min-w-0">
												<div className="flex justify-between items-center mb-1">
													<h4 className="font-bold text-gray-200 text-sm truncate pr-4">
														{h.filename || "Unknown File"}
													</h4>
													<span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider shrink-0">
														{new Date(h.finished_at).toLocaleDateString()}{" "}
														{new Date(h.finished_at).toLocaleTimeString([], {
															hour: "2-digit",
															minute: "2-digit",
														})}
													</span>
												</div>
												<div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
													<span className="capitalize font-medium text-gray-300 bg-gray-800 px-2 py-0.5 rounded-md">
														{h.service || "System"}
													</span>
													<span className="flex items-center gap-1">
														<Clock size={12} /> {formatDuration(h.duration_ms)}
													</span>
													{h.download_bytes > 0 && (
														<span className="flex items-center gap-1">
															<HardDrive size={12} />{" "}
															{formatSize(h.download_bytes)}
														</span>
													)}
													<span className="capitalize">{h.type}</span>
												</div>
												{h.status === "failed" && h.last_error && (
													<p className="text-[10px] text-red-400 mt-2 bg-red-500/10 px-2 py-1.5 rounded border border-red-500/20">
														{h.last_error}
													</p>
												)}
											</div>
										</div>
									))}
								</div>
							)}
						</div>
					)}

					{/* ============================== */}
					{/* TAB 5: DOWNLOAD STATS          */}
					{/* ============================== */}
					{activeTab === "stats" && (
						<div className="animate-in fade-in duration-300 h-full flex flex-col">
							{stats.length === 0 && !statsIsLoading ? (
								<div className="flex flex-col items-center justify-center flex-1 text-center text-gray-500">
									<BarChart3
										size={48}
										className="mb-4 opacity-50 text-orange-500"
									/>
									<h3 className="text-lg font-bold text-gray-300">
										No Download Stats
									</h3>
									<p className="text-sm mt-2 max-w-sm">
										Finish some downloads to populate your analytics dashboard.
									</p>
								</div>
							) : statsIsLoading ? (
								<div className="flex flex-col items-center justify-center flex-1 text-center text-gray-500">
									<Loader2
										size={48}
										className="mb-4 opacity-50 text-orange-500 animate-spin"
									/>
									<h3 className="text-lg font-bold text-gray-300">
										Crunching numbers...
									</h3>
								</div>
							) : (
								<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
									{stats.map((s) => (
										<div
											key={s.service}
											className="bg-gray-900/50 border border-gray-800 p-4 rounded-xl flex flex-col hover:border-orange-500/30 transition-colors"
										>
											<div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-3">
												<h4 className="font-bold text-gray-200 capitalize flex items-center gap-2">
													{s.service === "radarr" ? (
														<Film size={16} />
													) : s.service === "sonarr" ? (
														<Tv size={16} />
													) : (
														<Server size={16} />
													)}
													{s.service}
												</h4>
												<span className="text-xs font-bold bg-orange-500/20 text-orange-400 px-2 py-1 rounded-full">
													{s.total} Total Jobs
												</span>
											</div>

											<div className="grid grid-cols-2 gap-3 mb-4 mt-2">
												<div className="bg-[#0a0a0a] rounded-lg p-3 text-center border border-emerald-900/30 shadow-inner">
													<p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">
														Success
													</p>
													<p className="text-2xl font-black text-emerald-400">
														{s.completed}
													</p>
												</div>
												<div className="bg-[#0a0a0a] rounded-lg p-3 text-center border border-red-900/30 shadow-inner">
													<p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">
														Failed
													</p>
													<p className="text-2xl font-black text-red-400">
														{s.failed}
													</p>
												</div>
											</div>

											<div className="flex justify-between items-center text-xs text-gray-400 mt-auto pt-3 border-t border-gray-800/50">
												<span
													className="flex items-center gap-1.5"
													title="Average Download Time"
												>
													<Clock size={14} />{" "}
													{formatDuration(s.avg_duration_ms)} avg
												</span>
												<span
													className="flex items-center gap-1.5"
													title="Total Bandwidth"
												>
													<HardDrive size={14} /> {formatSize(s.bytes)}
												</span>
											</div>
										</div>
									))}
								</div>
							)}
						</div>
					)}

					{/* ============================== */}
					{/* TAB 6: LOGS                    */}
					{/* ============================== */}
					{activeTab === "logs" && (
						<div className="animate-in fade-in duration-300 flex flex-col h-full gap-4">
							<div className="flex gap-2 shrink-0">
								<button
									type="button"
									onClick={() => setLogType("general")}
									className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${logType === "general" ? "bg-zinc-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}
								>
									General Logs
								</button>
								<button
									type="button"
									onClick={() => setLogType("hunter")}
									className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${logType === "hunter" ? "bg-zinc-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}
								>
									Hunter Logs
								</button>
							</div>

							<div className="flex-1 bg-black border border-gray-800 rounded-xl p-4 overflow-y-auto font-mono text-xs text-gray-300 leading-relaxed custom-scrollbar">
								{logs.length === 0 && !logsIsLoading ? (
									<div className="text-gray-600 italic">
										Waiting for logs...
									</div>
								) : logsIsLoading ? (
									<div className="text-gray-600 italic">Loading logs...</div>
								) : (
									logs.map((line, idx) => (
										// biome-ignore lint/suspicious/noArrayIndexKey: log lines don't have unique IDs
										<div key={idx} className="wrap-break-word mb-1">
											{line.includes("[ERROR]") || line.includes("❌") ? (
												<span className="text-red-400">{line}</span>
											) : line.includes("[WARN]") || line.includes("⚠️") ? (
												<span className="text-yellow-400">{line}</span>
											) : line.includes("✅") ? (
												<span className="text-emerald-400">{line}</span>
											) : (
												line
											)}
										</div>
									))
								)}
								<div ref={logsEndRef} />
							</div>
						</div>
					)}
				</div>

				{/* FOOTER */}
				{activeTab === "settings" && (
					<div className="bg-[#0f0f10] border-t border-gray-800 p-4 shrink-0 flex justify-end">
						<button
							type="button"
							onClick={handleSave}
							disabled={loading}
							className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg font-bold text-sm transition-colors disabled:opacity-50"
						>
							{loading ? (
								"Saving..."
							) : (
								<>
									<Save size={16} /> Save Settings
								</>
							)}
						</button>
					</div>
				)}
			</div>

			{noServicesConfiguredPrompt && (
				<NoServicesConfiguredModal
					handleSave={handleSave}
					onCancel={() => setNoServicesConfiguredPrompt(false)}
					loading={loading}
				/>
			)}
		</div>
	);
};

export default SettingsModal;
