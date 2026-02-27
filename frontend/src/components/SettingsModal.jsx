import { useState, useEffect } from "react";
import {
	X,
	Save,
	Settings as SettingsIcon,
	Server,
	Send,
	FolderSync,
} from "lucide-react";

import { useToast } from "../context/Toast";

const SettingsModal = ({ isOpen, onClose }) => {
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
	});
	const [loading, setLoading] = useState(false);

	// biome-ignore lint/correctness/useExhaustiveDependencies: later
	useEffect(() => {
		if (isOpen) {
			fetchSettings();
		}
	}, [isOpen]);

	const fetchSettings = async () => {
		try {
			const res = await fetch("/api/v1/settings");
			const data = await res.json();
			setSettings((prev) => ({ ...prev, ...data }));
		} catch (err) {
			console.error("Failed to load settings", err);
			toast.error("Failed to load settings");
		}
	};

	const handleSave = async () => {
		setLoading(true);
		try {
			const payload = {
				...settings,
				syncEnabled: Boolean(settings.syncEnabled),
				hunterEnabled: Boolean(settings.hunterEnabled),
				syncInterval: Math.max(1, Number(settings.syncInterval) || 1),
				hunterInterval: Math.max(1, Number(settings.hunterInterval) || 1),
			};

			const res = await fetch("/api/v1/settings/batch", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});

			if (res.ok) {
				toast.success("Settings saved!");
			} else {
				toast.error("Failed to save settings");
			}
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
					<button
						type="button"
						onClick={onClose}
						className="p-2 hover:bg-gray-800 rounded-full text-gray-400 transition-colors"
					>
						<X size={20} />
					</button>
				</div>

				{/* CONTENT */}
				<div className="flex-1 overflow-y-auto p-6 space-y-8 bg-[#0a0a0a]">
					{/* Section: Worker Intervals */}
					<section>
						<h3 className="text-sm font-bold text-indigo-400 uppercase tracking-wider mb-4 flex items-center gap-2">
							<Server size={16} /> Automation Intervals
						</h3>
						<div className="grid grid-cols-2 gap-4">
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
								<label className="block text-xs text-gray-400">
									Interval (Minutes)
									<input
										type="number"
										name="syncInterval"
										value={settings.syncInterval}
										onChange={handleChange}
										disabled={!settings.syncEnabled}
										min="1"
										className="w-full bg-black border border-gray-700 rounded-lg p-2 text-white text-sm mt-1 disabled:opacity-50 disabled:cursor-not-allowed"
									/>
								</label>
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
								<label className="block text-xs text-gray-400">
									Interval (Minutes)
									<input
										type="number"
										name="hunterInterval"
										value={settings.hunterInterval}
										onChange={handleChange}
										disabled={!settings.hunterEnabled}
										min="1"
										className="w-full bg-black border border-gray-700 rounded-lg p-2 text-white text-sm mt-1 disabled:opacity-50 disabled:cursor-not-allowed"
									/>
								</label>
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
								<label className="block text-xs text-gray-400">
									API ID
									<input
										type="text"
										name="telegramApiId"
										value={settings.telegramApiId}
										onChange={handleChange}
										placeholder="e.g. 12345678"
										className="w-full bg-black border border-gray-700 rounded-lg p-2 text-white text-sm mt-1"
									/>
								</label>
							</div>
							<div>
								<label className="block text-xs text-gray-400">
									API Hash
									<input
										type="password"
										name="telegramApiHash"
										value={settings.telegramApiHash}
										onChange={handleChange}
										placeholder="Your 32-char hash"
										className="w-full bg-black border border-gray-700 rounded-lg p-2 text-white text-sm mt-1"
									/>
								</label>
							</div>
							<p className="text-[10px] text-gray-500 mt-2">
								Get these from my.telegram.org. Restart the backend after
								changing these to take effect.
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
								<label className="block text-xs text-gray-400">
									Eziarr Local Path (Docker Prefix)
									<input
										type="text"
										name="pathMapDocker"
										value={settings.pathMapDocker}
										onChange={handleChange}
										placeholder="/app/downloads"
										className="w-full bg-black border border-gray-700 rounded-lg p-2 text-white text-sm mt-1"
									/>
								</label>
							</div>
							<div>
								<label className="block text-xs text-gray-400">
									*Arr Remote Path (Host Prefix)
									<input
										type="text"
										name="pathMapRemote"
										value={settings.pathMapRemote}
										onChange={handleChange}
										placeholder="C:\Imports"
										className="w-full bg-black border border-gray-700 rounded-lg p-2 text-white text-sm mt-1"
									/>
								</label>
							</div>
							<p className="text-[10px] text-gray-500 mt-2">
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
		</div>
	);
};

export default SettingsModal;
