import { useState, useEffect, useRef } from "react";
import useSWR from "swr";
import {
	Lock,
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
import { apiCall } from "../utils/apiCall";
import { formatSize } from "../utils/formatSize";
import { formatDuration } from "../utils/formatDuration";

import { AnimatePresence, motion } from "motion/react";
import { spring } from "../ui/motion";

import { Button } from "./Buttons";
import { Modal } from "./Modal";
import { Tabs } from "./Tabs";
import { ui } from "../ui/styles";

// A row arriving in, or leaving, a live list (tasks, queue, history).
const rowMotion = {
	layout: true,
	initial: { opacity: 0, y: 12 },
	animate: { opacity: 1, y: 0 },
	exit: { opacity: 0, x: -24, transition: { duration: 0.16 } },
	transition: spring,
};

const NoServicesConfiguredModal = ({
	isOpen,
	handleSave,
	onCancel,
	isSavingConfig,
}) => (
	<Modal
		isOpen={isOpen}
		onClose={onCancel}
		size="sm"
		labelledBy="no-services-title"
		title="Save without a library?"
	>
		<div className="px-5 sm:px-6 pb-5">
			<p className="text-sm text-muted">
				Radarr, Sonarr and Lidarr are all empty, so Eziarr will have nothing
				to look for until you add one.
			</p>
			<div className="flex justify-end gap-2 mt-5">
				<Button variant="ghost" onClick={onCancel} disabled={isSavingConfig}>
					Go back
				</Button>
				<Button onClick={handleSave} disabled={isSavingConfig}>
					{isSavingConfig ? "Saving…" : "Save anyway"}
				</Button>
			</div>
		</div>
	</Modal>
);

const SettingsModal = ({
	isOpen,
	initialTab = "settings",
	onClose,
	onSaveSuccess,
}) => {
	const { toast } = useToast();

	// Tab State
	const [activeTab, setActiveTab] = useState("settings");

	// Live Data States
	const [logType, setLogType] = useState("general");
	const logsEndRef = useRef(null);

	const [settings, setSettings] = useState({
		password: "",
		confirmPassword: "",
		syncEnabled: true,
		hunterEnabled: true,
		syncInterval: 10,
		hunterInterval: 15,
		radarrConfigured: false,
		sonarrConfigured: false,
		lidarrConfigured: false,
		prowlarrConfigured: false,
		telegramConfigured: false,
		radarrUrl: "",
		radarrApiKey: "",
		sonarrUrl: "",
		sonarrApiKey: "",
		lidarrUrl: "",
		lidarrApiKey: "",
		prowlarrUrl: "",
		prowlarrApiKey: "",
		telegramApiId: "",
		telegramApiHash: "",
		pathMapRemote: "",
	});
	const [initialSettings, setInitialSettings] = useState({});
	const [isLoadingConfig, setIsLoadingConfig] = useState(false);
	const [isSavingConfig, setIsSavingConfig] = useState(false);

	const [testStatus, setTestStatus] = useState({
		radarr: "idle",
		sonarr: "idle",
		lidarr: "idle",
		prowlarr: "idle",
	});
	const [noServicesConfiguredPrompt, setNoServicesConfiguredPrompt] =
		useState(false);

	const { data: tasksData, isLoading: taskIsLoading } = useSWR(
		isOpen && activeTab === "tasks" ? "/api/v1/system/tasks" : null,
		apiCall,
		{ refreshInterval: 2000 },
	);

	const { data: queueData, isLoading: queueIsLoading } = useSWR(
		isOpen && activeTab === "queues" ? "/api/v1/downloads/queue" : null,
		apiCall,
		{ refreshInterval: 2000 },
	);

	const { data: historyData, isLoading: historyIsLoading } = useSWR(
		isOpen && activeTab === "history" ? "/api/v1/downloads/history" : null,
		apiCall,
		{ refreshInterval: 2000 },
	);

	const { data: statsData, isLoading: statsIsLoading } = useSWR(
		isOpen && activeTab === "stats" ? "/api/v1/downloads/stats" : null,
		apiCall,
		{ refreshInterval: 2000 },
	);

	const { data: logsData, isLoading: logsIsLoading } = useSWR(
		isOpen && activeTab === "logs"
			? `/api/v1/system/logs?type=${logType}`
			: null,
		apiCall,
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
			const loadConfig = async () => {
				try {
					setIsLoadingConfig(true);
					const res = await apiCall("/api/v1/settings");
					setSettings(res.settings);
					setInitialSettings(res.settings);
				} catch (_err) {
					// console.error("Failed to load settings", err);
					toast.error("Failed to load settings");
				} finally {
					setIsLoadingConfig(false);
				}
			};

			loadConfig();
			setActiveTab(initialTab);
		}
		return () => setNoServicesConfiguredPrompt(false);
	}, [isOpen]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: later
	useEffect(() => {
		if (activeTab === "logs" && logsEndRef.current) {
			logsEndRef.current.scrollIntoView({ behavior: "smooth" });
		}
	}, [logs, activeTab]);

	const handleTestConnection = async (serviceName) => {
		const url = settings[`${serviceName}Url`];
		const apiKey = settings[`${serviceName}ApiKey`];

		if (!url || !apiKey) {
			toast.error(`Please enter both URL and API Key for ${serviceName}`);
			return;
		}

		setTestStatus((prev) => ({ ...prev, [serviceName]: "loading" }));

		try {
			await apiCall("/api/v1/system/test", {
				method: "POST",
				body: { service: serviceName, url, apiKey },
			});

			setTestStatus((prev) => ({ ...prev, [serviceName]: "success" }));
			toast.success(`${serviceName} connected successfully!`);
		} catch (_err) {
			setTestStatus((prev) => ({ ...prev, [serviceName]: "error" }));
			toast.error(`${serviceName} connection failed.`);
		}

		setTimeout(() => {
			setTestStatus((prev) => ({ ...prev, [serviceName]: "idle" }));
		}, 3000);
	};

	const handleSave = async () => {
		if (settings.password && settings.password !== settings.confirmPassword) {
			toast.error("New passwords do not match!");
			return;
		}

		const noServices =
			!settings.radarrConfigured &&
			!settings.sonarrConfigured &&
			!settings.lidarrConfigured &&
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

		const payload = {
			...settings,
			syncEnabled: Boolean(settings.syncEnabled),
			hunterEnabled: Boolean(settings.hunterEnabled),
			syncInterval: Math.max(1, Number(settings.syncInterval) || 1),
			hunterInterval: Math.max(1, Number(settings.hunterInterval) || 1),
		};

		if (!payload.password) delete payload.password;
		delete payload.confirmPassword;

		try {
			setIsSavingConfig(true);
			await apiCall("/api/v1/settings/batch", {
				method: "POST",
				body: payload,
			});
			setNoServicesConfiguredPrompt(false);
			setSettings((prev) => ({
				...prev,
				password: "",
				confirmPassword: "",
			}));
			onSaveSuccess();
			toast.success("Settings saved!");
		} catch (_err) {
			// console.error("Failed to save settings", err);
			toast.error("Failed to save settings");
		} finally {
			setIsSavingConfig(false);
		}
	};

	const handleChange = (e) => {
		const { name, value } = e.target;
		setSettings((prev) => ({ ...prev, [name]: value }));
		if (name === "password" && !value.trim()) {
			setSettings((prev) => ({ ...prev, confirmPassword: "" }));
		}
	};

	const TABS = [
		{ id: "settings", label: "Config", icon: SettingsIcon },
		{ id: "tasks", label: "Tasks", icon: Activity, count: tasks.length || null },
		{ id: "queues", label: "Queue", icon: ListOrdered, count: queue.length || null },
		{ id: "history", label: "History", icon: History },
		{ id: "stats", label: "Stats", icon: BarChart3 },
		{ id: "logs", label: "Logs", icon: ScrollText },
	];

	return (
		<>
			<Modal
				isOpen={isOpen}
				onClose={onClose}
				size="lg"
				labelledBy="settings-title"
				title="Settings"
				subtitle="Libraries, sources, and what the worker is doing."
			>
				<Tabs id="settings" tabs={TABS} active={activeTab} onChange={setActiveTab} />

				{/* CONTENT AREA */}
				<div className="flex-auto min-h-0 h-[70dvh] overflow-y-auto p-4 sm:p-6 bg-ground relative">
					{isLoadingConfig && activeTab === "settings" ? (
						<div className="space-y-4" aria-busy="true">
							{[0, 1, 2].map((i) => (
								<div key={i} className="bg-surface rounded-[20px] p-5">
									<div className="h-4 w-32 rounded bg-raised" />
									<div className="grid sm:grid-cols-2 gap-4 mt-5">
										<div className="h-9 rounded-full bg-raised" />
										<div className="h-9 rounded-full bg-raised" />
									</div>
								</div>
							))}
						</div>
					) : (
					<AnimatePresence mode="wait" initial={false}>
					<motion.div
						key={activeTab}
						initial={{ opacity: 0, y: 8 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -6 }}
						transition={{ duration: 0.18 }}
					>
					{/* ============================== */}
					{/* TAB 1: SETTINGS                */}
					{/* ============================== */}
					{activeTab === "settings" && (
						<div className="space-y-8">
							{/* Section: Credentials */}
							<section>
								<h3 className="text-sm font-semibold text-ink mb-4 flex items-center gap-2">
									<Lock size={16} /> Credentials
								</h3>
								<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-surface p-4 rounded-2xl">
									{/* <div>
										<label className="block text-xs text-muted">
											Username
										</label>
										<input
											type="text"
											name="username"
											value={settings.username || ""}
											onChange={handleChange}
											className={`${ui.input} mt-1`}
											placeholder="admin"
										/>
									</div> */}
									<div>
										{/** biome-ignore lint/a11y/noLabelWithoutControl: nop */}
										<label className="block text-xs text-muted">
											New Password
										</label>
										<input
											type="password"
											name="password"
											value={settings.password || ""}
											onChange={handleChange}
											className={`${ui.input} mt-1`}
											placeholder="Leave blank to keep current"
										/>
									</div>
									<div>
										{/** biome-ignore lint/a11y/noLabelWithoutControl: nop */}
										<label className="block text-xs text-muted">
											Confirm Password
										</label>
										<input
											type="password"
											name="confirmPassword"
											value={settings.confirmPassword || ""}
											onChange={handleChange}
											disabled={!settings.password}
											className={`${ui.input} mt-1 disabled:opacity-50 disabled:cursor-not-allowed`}
											placeholder="Confirm new password"
										/>
									</div>
								</div>
							</section>
							{/* Section: Worker Intervals */}
							<section>
								<h3 className="text-sm font-semibold text-ink mb-4 flex items-center gap-2">
									<Server size={16} /> Automation Intervals
								</h3>
								<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
									<div
										className={`bg-surface p-4 rounded-2xl transition-[opacity,filter] ${!settings.syncEnabled ? "opacity-60 grayscale-50" : ""}`}
									>
										<div className="flex justify-between items-center mb-3">
											<span className="text-sm font-semibold text-ink">
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
												className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${settings.syncEnabled ? "bg-primary" : "bg-raised"}`}
											>
												<span
													className={`inline-block h-3 w-3 transform rounded-full transition-transform ${settings.syncEnabled ? "bg-on-primary translate-x-5" : "bg-muted translate-x-1"}`}
												/>
											</button>
										</div>
										{/** biome-ignore lint/a11y/noLabelWithoutControl: nop */}
										<label className="block text-xs text-muted">
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
										className={`bg-surface p-4 rounded-2xl transition-[opacity,filter] ${!settings.hunterEnabled ? "opacity-60 grayscale-50" : ""}`}
									>
										<div className="flex justify-between items-center mb-3">
											<span className="text-sm font-semibold text-ink">
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
												className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${settings.hunterEnabled ? "bg-primary" : "bg-raised"}`}
											>
												<span
													className={`inline-block h-3 w-3 transform rounded-full transition-transform ${settings.hunterEnabled ? "bg-on-primary translate-x-5" : "bg-muted translate-x-1"}`}
												/>
											</button>
										</div>
										{/** biome-ignore lint/a11y/noLabelWithoutControl: nop */}
										<label className="block text-xs text-muted">
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
									<h3 className="text-sm font-semibold text-ink flex items-center gap-2">
										<Link size={16} /> Service Connections
									</h3>
									<p className="text-xs text-faint mt-1">
										Leave blank if you do not use the service.{" "}
										<strong className="text-muted">
											Do not include a trailing slash (/) in URLs.
										</strong>
									</p>
								</div>
								<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
									{/* RADARR */}
									<div className="bg-surface p-4 rounded-2xl focus-within:border-warning/30 transition-colors">
										<div className="flex justify-between items-center mb-3">
											<h4 className="text-sm font-semibold text-ink flex items-center gap-2">
												<Film size={16} /> Radarr
											</h4>
											{(!settings.radarrConfigured ||
												settings.radarrApiKey !== "" ||
												(settings.radarrUrl || "") !==
													(initialSettings.radarrUrl || "")) && (
												<button
													type="button"
													onClick={() => handleTestConnection("radarr")}
													disabled={testStatus.radarr === "loading"}
													className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold transition-colors ${
														testStatus.radarr === "success"
															? "bg-pos-bg text-positive"
															: testStatus.radarr === "error"
																? "bg-neg-bg text-negative"
																: "bg-raised text-ink hover:bg-raised hover:text-ink"
													}`}
												>
													{testStatus.radarr === "loading" && (
														<Loader2 size={12} className="animate-spin" />
													)}
													{testStatus.radarr === "success" && (
														<Check size={12} />
													)}
													{testStatus.radarr === "error" && <X size={12} />}
													{testStatus.radarr === "idle" && "Test"}
													{testStatus.radarr !== "idle" &&
														testStatus.radarr !== "loading" &&
														"Success"}
												</button>
											)}
										</div>
										<div className="space-y-3">
											<div>
												{/** biome-ignore lint/a11y/noLabelWithoutControl: nop */}
												<label className="block text-xs text-muted">
													URL
												</label>
												<input
													type="text"
													name="radarrUrl"
													value={settings.radarrUrl || ""}
													onChange={handleChange}
													placeholder={
														settings.radarrUrl || "http://192.168.1.50:7878"
													}
													className={`${ui.input} mt-1`}
												/>
											</div>
											<div>
												{/** biome-ignore lint/a11y/noLabelWithoutControl: nop */}
												<label className="block text-xs text-muted">
													API Key
												</label>
												<input
													type="password"
													name="radarrApiKey"
													value={settings.radarrApiKey || ""}
													onChange={handleChange}
													placeholder={
														settings.radarrConfigured
															? "Radarr already configured"
															: "32-character API key"
													}
													className={`${ui.input} mt-1`}
												/>
											</div>
										</div>
									</div>

									{/* SONARR */}
									<div className="bg-surface p-4 rounded-2xl focus-within:border-control transition-colors">
										<div className="flex justify-between items-center mb-3">
											<h4 className="text-sm font-semibold text-ink flex items-center gap-2">
												<Tv size={16} /> Sonarr
											</h4>
											{(!settings.sonarrConfigured ||
												settings.sonarrApiKey !== "" ||
												(settings.sonarrUrl || "") !==
													(initialSettings.sonarrUrl || "")) && (
												<button
													type="button"
													onClick={() => handleTestConnection("sonarr")}
													disabled={testStatus.sonarr === "loading"}
													className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold transition-colors ${testStatus.sonarr === "success" ? "bg-pos-bg text-positive" : testStatus.sonarr === "error" ? "bg-neg-bg text-negative" : "bg-raised text-ink hover:bg-raised hover:text-ink"}`}
												>
													{testStatus.sonarr === "loading" && (
														<Loader2 size={12} className="animate-spin" />
													)}
													{testStatus.sonarr === "success" && (
														<Check size={12} />
													)}
													{testStatus.sonarr === "error" && <X size={12} />}
													{testStatus.sonarr === "idle" && "Test"}
													{testStatus.sonarr !== "idle" &&
														testStatus.sonarr !== "loading" &&
														"Tested"}
												</button>
											)}
										</div>
										<div className="space-y-3">
											<div>
												{/** biome-ignore lint/a11y/noLabelWithoutControl: nop */}
												<label className="block text-xs text-muted">
													URL
												</label>
												<input
													type="text"
													name="sonarrUrl"
													value={settings.sonarrUrl || ""}
													onChange={handleChange}
													placeholder={
														settings.sonarrUrl || "http://192.168.1.50:8989"
													}
													className={`${ui.input} mt-1`}
												/>
											</div>
											<div>
												{/** biome-ignore lint/a11y/noLabelWithoutControl: nop */}
												<label className="block text-xs text-muted">
													API Key
												</label>
												<input
													type="password"
													name="sonarrApiKey"
													value={settings.sonarrApiKey || ""}
													onChange={handleChange}
													placeholder={
														settings.sonarrConfigured
															? "Sonarr already configured"
															: "32-character API key"
													}
													className={`${ui.input} mt-1`}
												/>
											</div>
										</div>
									</div>

									{/* LIDARR */}
									<div className="bg-surface p-4 rounded-2xl focus-within:border-positive/30 transition-colors">
										<div className="flex justify-between items-center mb-3">
											<h4 className="text-sm font-semibold text-ink flex items-center gap-2">
												<Film size={16} /> Lidarr
											</h4>
											{(!settings.lidarrConfigured ||
												settings.lidarrApiKey !== "" ||
												(settings.lidarrUrl || "") !==
													(initialSettings.lidarrUrl || "")) && (
												<button
													type="button"
													onClick={() => handleTestConnection("lidarr")}
													disabled={testStatus.lidarr === "loading"}
													className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold transition-colors ${testStatus.lidarr === "success" ? "bg-pos-bg text-positive" : testStatus.lidarr === "error" ? "bg-neg-bg text-negative" : "bg-raised text-ink hover:bg-raised hover:text-ink"}`}
												>
													{testStatus.lidarr === "loading" && (
														<Loader2 size={12} className="animate-spin" />
													)}
													{testStatus.lidarr === "success" && (
														<Check size={12} />
													)}
													{testStatus.lidarr === "error" && <X size={12} />}
													{testStatus.lidarr === "idle" && "Test"}
													{testStatus.lidarr !== "idle" &&
														testStatus.lidarr !== "loading" &&
														"Tested"}
												</button>
											)}
										</div>
										<div className="space-y-3">
											<div>
												{/** biome-ignore lint/a11y/noLabelWithoutControl: nop */}
												<label className="block text-xs text-muted">
													URL
												</label>
												<input
													type="text"
													name="lidarrUrl"
													value={settings.lidarrUrl || ""}
													onChange={handleChange}
													placeholder={
														settings.lidarrUrl || "http://192.168.1.50:8686"
													}
													className={`${ui.input} mt-1`}
												/>
											</div>
											<div>
												{/** biome-ignore lint/a11y/noLabelWithoutControl: nop */}
												<label className="block text-xs text-muted">
													API Key
												</label>
												<input
													type="password"
													name="lidarrApiKey"
													value={settings.lidarrApiKey || ""}
													onChange={handleChange}
													placeholder={
														settings.lidarrConfigured
															? "Lidarr already configured"
															: "32-character API key"
													}
													className={`${ui.input} mt-1`}
												/>
											</div>
										</div>
									</div>
								</div>
							</section>

							{/* Section: Prowlarr Connection */}
							<section>
								<h3 className="text-sm font-semibold text-ink mb-4 flex items-center gap-2">
									<Search size={16} /> Prowlarr
								</h3>
								<div className="space-y-3 bg-surface p-4 rounded-2xl">
									<div>
										{/** biome-ignore lint/a11y/noLabelWithoutControl: nop */}
										<label className="block text-xs text-muted">URL</label>
										<input
											type="text"
											name="prowlarrUrl"
											value={settings.prowlarrUrl || ""}
											onChange={handleChange}
											placeholder={
												settings.prowlarrUrl || "http://192.168.1.50:9696"
											}
											className={`${ui.input} mt-1`}
										/>
									</div>
									<div>
										{/** biome-ignore lint/a11y/noLabelWithoutControl: nop */}
										<label className="block text-xs text-muted">
											API Key
										</label>
										<input
											type="text"
											name="prowlarrApiKey"
											value={settings.prowlarrApiKey || ""}
											onChange={handleChange}
											placeholder={
												settings.prowlarrConfigured
													? "Prowlarr already configured"
													: "32-character API key"
											}
											className={`${ui.input} mt-1`}
										/>
									</div>
								</div>
							</section>

							{/* Section: Telegram Credentials */}
							<section>
								<h3 className="text-sm font-semibold text-ink mb-4 flex items-center gap-2">
									<Send size={16} /> Telegram MTProto
								</h3>
								<div className="space-y-3 bg-surface p-4 rounded-2xl">
									<div>
										{/** biome-ignore lint/a11y/noLabelWithoutControl: nop */}
										<label className="block text-xs text-muted">
											API ID
										</label>
										<input
											type="text"
											name="telegramApiId"
											value={settings.telegramApiId || ""}
											onChange={handleChange}
											placeholder={
												settings.telegramConfigured
													? "Telegram already configured"
													: "e.g. 12345678"
											}
											className={`${ui.input} mt-1`}
										/>
									</div>
									<div>
										{/** biome-ignore lint/a11y/noLabelWithoutControl: nop */}
										<label className="block text-xs text-muted">
											API Hash
										</label>
										<input
											type="password"
											name="telegramApiHash"
											value={settings.telegramApiHash || ""}
											onChange={handleChange}
											placeholder={
												settings.telegramConfigured
													? "Telegram already configured"
													: "Your 32-char hash"
											}
											className={`${ui.input} mt-1`}
										/>
									</div>
									<p className="text-xs text-faint">
										Get these from my.telegram.org.
									</p>
								</div>
							</section>

							{/* Section: Path Mapping */}
							<section>
								<h3 className="text-sm font-semibold text-ink mb-4 flex items-center gap-2">
									<FolderSync size={16} /> Path Translation (Optional)
								</h3>
								<div className="space-y-3 bg-surface p-4 rounded-2xl">
									<div>
										{/** biome-ignore lint/a11y/noLabelWithoutControl: nop */}
										<label className="block text-xs text-muted">
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
									<p className="text-xs text-faint">
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
						<div className="h-full flex flex-col">
							{tasks.length === 0 && !taskIsLoading ? (
								<div className="flex flex-col items-center justify-center flex-1 text-center text-faint">
									<Activity
										size={48}
										className="mb-4 opacity-50 text-faint"
									/>
									<h3 className="text-lg font-semibold text-ink">
										No Active Tasks
									</h3>
									<p className="text-sm mt-2 max-w-sm">
										Eziarr is currently idle.
									</p>
								</div>
							) : taskIsLoading ? (
								<div className="flex flex-col items-center justify-center flex-1 text-center text-faint">
									<Loader2
										size={48}
										className="mb-4 opacity-50 text-positive animate-spin"
									/>
									<h3 className="text-lg font-semibold text-ink">
										Loading tasks...
									</h3>
								</div>
							) : (
								<div className="space-y-3">
									<AnimatePresence initial={false}>
									{tasks.map((task) => (
										<motion.div
											{...rowMotion}
											
											key={task.id}
											className="bg-surface p-4 rounded-2xl flex items-center gap-4"
										>
											<div className="text-positive pt-0.5">
												<RefreshCw
													className="text-positive animate-spin"
													size={20}
												/>
											</div>
											<div className="flex-1 min-w-0">
												<div className="flex justify-between items-center mb-1">
													<h4 className="font-semibold text-ink text-sm flex items-center gap-2 capitalize">
														{task.type}
													</h4>
													<span className="text-xs text-faint font-semibold">
														{new Date(task.updated_at).toLocaleTimeString()}
													</span>
												</div>
												<p className="text-xs text-muted truncate">
													{task.message}
												</p>
												{task.progress > 0 && task.progress < 100 && (
													<div className="w-full bg-raised rounded-full h-1.5 mt-2 overflow-hidden">
														<div
															className="bg-accent h-1.5 rounded-full transition-[width] duration-500 ease-out"
															style={{ width: `${task.progress}%` }}
														></div>
													</div>
												)}
											</div>
										</motion.div>
									))}
								</AnimatePresence>
								</div>
							)}
						</div>
					)}

					{/* ============================== */}
					{/* TAB 3: DOWNLOAD QUEUES         */}
					{/* ============================== */}
					{activeTab === "queues" && (
						<div className="h-full flex flex-col">
							{queue.length === 0 && !queueIsLoading ? (
								<div className="flex flex-col items-center justify-center flex-1 text-center text-faint">
									<ListOrdered
										size={48}
										className="mb-4 opacity-50 text-faint"
									/>
									<h3 className="text-lg font-semibold text-ink">
										No Downloads Queued
									</h3>
									<p className="text-sm mt-2 max-w-sm">
										Download queue is clear.
									</p>
								</div>
							) : queueIsLoading ? (
								<div className="flex flex-col items-center justify-center flex-1 text-center text-faint">
									<Loader2
										size={48}
										className="mb-4 opacity-50 text-ink animate-spin"
									/>
									<h3 className="text-lg font-semibold text-ink">
										Loading download queue...
									</h3>
								</div>
							) : (
								<div className="space-y-3">
									<AnimatePresence initial={false}>
									{queue.map((q) => {
										let payloadObj = {};
										try {
											payloadObj = JSON.parse(q.payload);
										} catch (_e) {}
										return (
											<motion.div
											{...rowMotion}
											
												key={q.id}
												className="bg-surface p-4 rounded-2xl flex items-center gap-4"
											>
												<div
													className={`pt-0.5 ${q.status === "retry" ? "text-warning" : q.status === "downloading" ? "text-ink" : "text-muted"}`}
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
															<h4 className="font-semibold text-ink text-sm capitalize">
																{q.type} Queue
															</h4>
															<span
																className={`text-xs font-semibold px-2 py-0.5 rounded-full ${q.status === "downloading" ? "bg-raised text-ink" : q.status === "retry" ? "bg-warn-bg text-warning" : "bg-raised text-muted"}`}
															>
																{q.status}
															</span>
														</div>
														<span className="text-xs text-faint font-semibold shrink-0">
															Added:{" "}
															{new Date(q.created_at).toLocaleTimeString([], {
																hour: "2-digit",
																minute: "2-digit",
															})}
														</span>
													</div>
													<p className="text-xs text-muted truncate mt-1">
														{payloadObj.filename || "Processing Metadata..."}
													</p>
													{q.status === "retry" && q.last_error && (
														<p className="text-xs text-warning mt-2">
															Will retry at{" "}
															{new Date(q.next_attempt).toLocaleTimeString()}.
															Reason: {q.last_error}
														</p>
													)}
												</div>
											</motion.div>
										);
									})}
								</AnimatePresence>
								</div>
							)}
						</div>
					)}

					{/* ============================== */}
					{/* TAB 4: DOWNLOAD HISTORY        */}
					{/* ============================== */}
					{activeTab === "history" && (
						<div className="h-full flex flex-col">
							{history.length === 0 && !historyIsLoading ? (
								<div className="flex flex-col items-center justify-center flex-1 text-center text-faint">
									<History
										size={48}
										className="mb-4 opacity-50 text-faint"
									/>
									<h3 className="text-lg font-semibold text-ink">
										No Download History
									</h3>
									<p className="text-sm mt-2 max-w-sm">
										Past downloads will be logged here.
									</p>
								</div>
							) : historyIsLoading ? (
								<div className="flex flex-col items-center justify-center flex-1 text-center text-faint">
									<Loader2
										size={48}
										className="mb-4 opacity-50 text-ink animate-spin"
									/>
									<h3 className="text-lg font-semibold text-ink">
										Loading history...
									</h3>
								</div>
							) : (
								<div className="space-y-3">
									<AnimatePresence initial={false}>
									{history.map((h) => (
										<motion.div
											{...rowMotion}
											
											key={h.id}
											className="bg-surface p-4 rounded-2xl flex items-center gap-4"
										>
											<div
												className={`pt-0.5 shrink-0 ${h.status === "completed" ? "text-positive" : "text-negative"}`}
											>
												{h.status === "completed" ? (
													<CheckCircle2 size={20} />
												) : (
													<XCircle size={20} />
												)}
											</div>
											<div className="flex-1 min-w-0">
												<div className="flex justify-between items-center mb-1">
													<h4 className="font-semibold text-ink text-sm truncate pr-4">
														{h.filename || "Unknown File"}
													</h4>
													<span className="text-xs text-faint font-semibold shrink-0">
														{new Date(h.finished_at).toLocaleDateString()}{" "}
														{new Date(h.finished_at).toLocaleTimeString([], {
															hour: "2-digit",
															minute: "2-digit",
														})}
													</span>
												</div>
												<div className="flex items-center gap-3 text-xs text-muted mt-1">
													<span className="capitalize font-medium text-ink bg-raised px-2 py-0.5 rounded-md">
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
													<p className="text-xs text-negative mt-2 bg-neg-bg px-2 py-1.5 rounded border border-negative/30">
														{h.last_error}
													</p>
												)}
											</div>
										</motion.div>
									))}
								</AnimatePresence>
								</div>
							)}
						</div>
					)}

					{/* ============================== */}
					{/* TAB 5: DOWNLOAD STATS          */}
					{/* ============================== */}
					{activeTab === "stats" && (
						<div className="h-full flex flex-col">
							{stats.length === 0 && !statsIsLoading ? (
								<div className="flex flex-col items-center justify-center flex-1 text-center text-faint">
									<BarChart3
										size={48}
										className="mb-4 opacity-50 text-faint"
									/>
									<h3 className="text-lg font-semibold text-ink">
										No Download Stats
									</h3>
									<p className="text-sm mt-2 max-w-sm">
										Finish some downloads to populate your analytics dashboard.
									</p>
								</div>
							) : statsIsLoading ? (
								<div className="flex flex-col items-center justify-center flex-1 text-center text-faint">
									<Loader2
										size={48}
										className="mb-4 opacity-50 text-warning animate-spin"
									/>
									<h3 className="text-lg font-semibold text-ink">
										Crunching numbers...
									</h3>
								</div>
							) : (
								<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
									{stats.map((s) => (
										<div
											key={s.service}
											className="bg-surface p-4 rounded-2xl flex flex-col transition-colors"
										>
											<div className="flex items-center justify-between border-b border-line pb-2 mb-3">
												<h4 className="font-semibold text-ink capitalize flex items-center gap-2">
													{s.service === "radarr" ? (
														<Film size={16} />
													) : s.service === "sonarr" ? (
														<Tv size={16} />
													) : (
														<Server size={16} />
													)}
													{s.service}
												</h4>
												<span className="text-xs text-muted num">
													{s.total} {s.total === 1 ? "job" : "jobs"}
												</span>
											</div>

											<div className="grid grid-cols-2 gap-3 mb-4 mt-2">
												<div className="bg-ground rounded-2xl p-3">
													<p className="text-xs text-faint mb-1">Imported</p>
													<p className="text-2xl font-semibold text-ink num">{s.completed}</p>
												</div>
												<div className="bg-ground rounded-2xl p-3">
													<p className="text-xs text-faint mb-1">Failed</p>
													<p className={`text-2xl font-semibold num ${s.failed > 0 ? "text-negative" : "text-ink"}`}>
														{s.failed}
													</p>
												</div>
											</div>

											<div className="flex justify-between items-center text-xs text-muted mt-auto pt-3 border-t border-line">
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
						<div className="animate-in flex flex-col h-full gap-4">
							<div className="flex gap-2 shrink-0">
								<button
									type="button"
									onClick={() => setLogType("general")}
									className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${logType === "general" ? "bg-raised text-ink" : "bg-raised text-muted hover:bg-raised"}`}
								>
									General Logs
								</button>
								<button
									type="button"
									onClick={() => setLogType("hunter")}
									className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${logType === "hunter" ? "bg-raised text-ink" : "bg-raised text-muted hover:bg-raised"}`}
								>
									Hunter Logs
								</button>
							</div>

							<div /* taste-skill-ignore: log output is literal text */ className="flex-1 bg-ground rounded-2xl p-4 overflow-y-auto font-mono text-xs text-ink leading-relaxed custom-scrollbar">
								{logs.length === 0 && !logsIsLoading ? (
									<div className="text-faint italic">
										Waiting for logs...
									</div>
								) : logsIsLoading ? (
									<div className="text-faint italic">Loading logs...</div>
								) : (
									logs.map((line, idx) => (
										// biome-ignore lint/suspicious/noArrayIndexKey: log lines don't have unique IDs
										<div key={idx} className="wrap-break-word mb-1">
											{/* Colour by the markers the backend writes into its log lines. */}
											{line.includes("[ERROR]") || line.includes("❌") /* taste-skill-ignore */ ? (
												<span className="text-negative">{line}</span>
											) : line.includes("[WARN]") || line.includes("⚠️") /* taste-skill-ignore */ ? (
												<span className="text-warning">{line}</span>
											) : line.includes("✅") /* taste-skill-ignore */ ? (
												<span className="text-positive">{line}</span>
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
				</motion.div>
					</AnimatePresence>
					)}
				</div>

				{/* FOOTER */}
				<AnimatePresence initial={false}>
					{activeTab === "settings" && (
						<motion.div
							className="bg-surface px-4 sm:px-6 py-3 shrink-0 flex items-center justify-end gap-3"
							initial={{ opacity: 0, y: 12 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: 12 }}
							transition={{ duration: 0.18 }}
						>
							<Button onClick={handleSave} disabled={isSavingConfig || isLoadingConfig}>
								{isSavingConfig ? (
									<Loader2 size={15} className="animate-spin" />
								) : (
									<Save size={15} />
								)}
								{isSavingConfig ? "Saving…" : "Save settings"}
							</Button>
						</motion.div>
					)}
				</AnimatePresence>
			</Modal>

			<NoServicesConfiguredModal
				isOpen={noServicesConfiguredPrompt}
				handleSave={handleSave}
				onCancel={() => setNoServicesConfiguredPrompt(false)}
				isSavingConfig={isSavingConfig}
			/>
		</>
	);
};

export default SettingsModal;
