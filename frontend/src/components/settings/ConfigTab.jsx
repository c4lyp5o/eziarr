import {
	Lock,
	X,
	Server,
	Send,
	FolderSync,
	Film,
	Tv,
	Search,
	Link,
	Check,
	Loader2,
} from "lucide-react";
import { ui } from "../../ui/styles";

export default function ConfigTab({ settings, setSettings, initialSettings, handleChange, testStatus, handleTestConnection }) {
	return (
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
		
	);
}
