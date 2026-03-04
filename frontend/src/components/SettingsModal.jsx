import { useState, useEffect } from "react";
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
} from "lucide-react";

import { useToast } from "../context/Toast";
import { apiCall } from "../utils/apiCall";

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

	const [settings, setSettings] = useState({
		syncEnabled: true,
		hunterEnabled: true,
		syncInterval: 10,
		hunterInterval: 15,
		telegramApiId: "",
		telegramApiHash: "",
		pathMapDocker: "",
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
		radarr: "idle", // idle | loading | success | error
		sonarr: "idle",
		lidarr: "idle",
		prowlarr: "idle",
	});
	const [noServicesConfiguredPrompt, setNoServicesConfiguredPrompt] =
		useState(false);

	const [loading, setLoading] = useState(false);

	// biome-ignore lint/correctness/useExhaustiveDependencies: later
	useEffect(() => {
		if (isOpen) {
			fetchSettings();
		}

		return () => {
			setNoServicesConfiguredPrompt(false);
		};
	}, [isOpen]);

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

		// Reset button state after 3 seconds
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
			<div className="bg-[#0f0f10] border border-gray-800 w-full max-w-2xl max-h-[90vh] rounded-2xl flex flex-col shadow-2xl overflow-hidden">
				{/* HEADER */}
				<div className="flex justify-between items-center p-6 border-b border-gray-800 bg-[#0f0f10]">
					<h2 className="text-xl font-bold text-white flex items-center gap-2">
						<SettingsIcon className="text-gray-400" size={20} /> App Settings
					</h2>
					<Button variant="icon" size="sm" onClick={onClose}>
						<X size={20} />
					</Button>
				</div>

				{/* CONTENT */}
				<div className="flex-1 overflow-y-auto p-6 space-y-8 bg-[#0a0a0a]">
					{/* Section: Worker Intervals */}
					<section>
						<h3 className="text-sm font-bold text-indigo-400 uppercase tracking-wider mb-4 flex items-center gap-2">
							<Server size={16} /> Automation Intervals
						</h3>
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
							{/* SYNC CARD */}
							<div
								className={`bg-gray-900/50 p-4 rounded-xl border border-gray-800 transition-all ${!settings.syncEnabled ? "opacity-60 grayscale-50" : ""}`}
							>
								<div className="flex justify-between items-center mb-3">
									<span className="text-sm font-bold text-gray-200">Sync</span>
									{/* Custom Toggle */}
									<button
										type="button"
										onClick={() =>
											setSettings((p) => ({
												...p,
												syncEnabled: !p.syncEnabled,
											}))
										}
										className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
											settings.syncEnabled ? "bg-indigo-500" : "bg-gray-700"
										}`}
									>
										<span
											className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
												settings.syncEnabled ? "translate-x-5" : "translate-x-1"
											}`}
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

							{/* HUNTER CARD */}
							<div
								className={`bg-gray-900/50 p-4 rounded-xl border border-gray-800 transition-all ${!settings.hunterEnabled ? "opacity-60 grayscale-50" : ""}`}
							>
								<div className="flex justify-between items-center mb-3">
									<span className="text-sm font-bold text-gray-200">
										Hunter
									</span>
									{/* Custom Toggle */}
									<button
										type="button"
										onClick={() =>
											setSettings((p) => ({
												...p,
												hunterEnabled: !p.hunterEnabled,
											}))
										}
										className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
											settings.hunterEnabled ? "bg-indigo-500" : "bg-gray-700"
										}`}
									>
										<span
											className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
												settings.hunterEnabled
													? "translate-x-5"
													: "translate-x-1"
											}`}
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
										className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-bold transition-colors ${
											testStatus.radarr === "success"
												? "bg-emerald-500/20 text-emerald-400"
												: testStatus.radarr === "error"
													? "bg-red-500/20 text-red-400"
													: "bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white"
										}`}
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
										<label className="block text-xs text-gray-400">URL</label>
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
										className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-bold transition-colors ${
											testStatus.sonarr === "success"
												? "bg-emerald-500/20 text-emerald-400"
												: testStatus.sonarr === "error"
													? "bg-red-500/20 text-red-400"
													: "bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white"
										}`}
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
										<label className="block text-xs text-gray-400">URL</label>
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
										className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-bold transition-colors ${
											testStatus.lidarr === "success"
												? "bg-emerald-500/20 text-emerald-400"
												: testStatus.lidarr === "error"
													? "bg-red-500/20 text-red-400"
													: "bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white"
										}`}
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
										<label className="block text-xs text-gray-400">URL</label>
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
								<label className="block text-xs text-gray-400">API Key</label>
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
								<label className="block text-xs text-gray-400">API ID</label>
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
								<label className="block text-xs text-gray-400">API Hash</label>
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
									Eziarr Local Path (Docker Prefix)
								</label>
								<input
									type="text"
									name="pathMapDocker"
									value={settings.pathMapDocker}
									onChange={handleChange}
									placeholder="/app/downloads"
									className={`${ui.input} mt-1`}
								/>
							</div>
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

				{/* FOOTER */}
				<div className="bg-[#0f0f10] border-t border-gray-800 p-4 flex justify-end">
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
