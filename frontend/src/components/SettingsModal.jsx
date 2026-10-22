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

import { AnimatePresence, motion } from "motion/react";

import { Button } from "./Buttons";
import { Modal } from "./Modal";
import { Tabs } from "./Tabs";
import ConfigTab from "./settings/ConfigTab";
import TasksTab from "./settings/TasksTab";
import QueueTab from "./settings/QueueTab";
import HistoryTab from "./settings/HistoryTab";
import StatsTab from "./settings/StatsTab";
import LogsTab from "./settings/LogsTab";

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
					{activeTab === "settings" && <ConfigTab settings={settings} setSettings={setSettings} initialSettings={initialSettings} handleChange={handleChange} testStatus={testStatus} handleTestConnection={handleTestConnection} />}

					{/* ============================== */}
					{/* TAB 2: TASKS                   */}
					{/* ============================== */}
					{activeTab === "tasks" && <TasksTab tasks={tasks} taskIsLoading={taskIsLoading} />}

					{/* ============================== */}
					{/* TAB 3: DOWNLOAD QUEUES         */}
					{/* ============================== */}
					{activeTab === "queues" && <QueueTab queue={queue} queueIsLoading={queueIsLoading} />}

					{/* ============================== */}
					{/* TAB 4: DOWNLOAD HISTORY        */}
					{/* ============================== */}
					{activeTab === "history" && <HistoryTab history={history} historyIsLoading={historyIsLoading} />}

					{/* ============================== */}
					{/* TAB 5: DOWNLOAD STATS          */}
					{/* ============================== */}
					{activeTab === "stats" && <StatsTab stats={stats} statsIsLoading={statsIsLoading} />}

					{/* ============================== */}
					{/* TAB 6: LOGS                    */}
					{/* ============================== */}
					{activeTab === "logs" && <LogsTab logs={logs} logsIsLoading={logsIsLoading} logType={logType} setLogType={setLogType} logsEndRef={logsEndRef} />}
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
