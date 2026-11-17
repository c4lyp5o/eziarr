import { ArrowUpRight } from "lucide-react";
import { Mark } from "../Mark";

const SERVICE_NAMES = {
	radarr: "Radarr",
	sonarr: "Sonarr",
	lidarr: "Lidarr",
	prowlarr: "Prowlarr",
	telegram: "Telegram",
};

const formatUptime = (seconds) => {
	if (seconds == null) return null;
	const d = Math.floor(seconds / 86400);
	const h = Math.floor((seconds % 86400) / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	return d ? `${d}d ${h}h ${m}m` : h ? `${h}h ${m}m` : `${m}m`;
};

// One panel: what's running and what it's wired to. Runtime and platform
// were dropped: nobody acts on the Bun version or the OS name.
export default function SystemTab({ status }) {
	const uptime = formatUptime(status?.runtime?.uptimeSeconds);
	const services = Object.entries(status?.features || {});
	const configured = services.filter(([, on]) => on).length;

	return (
		<section className="border border-line rounded-md bg-surface">
			<div className="flex flex-wrap items-center gap-x-4 gap-y-3 p-5">
				<Mark size={36} />
				<div className="min-w-0">
					<h2 className="font-semibold">
						eziarr{" "}
						{status?.currentVersion && (
							<span className="text-muted font-normal text-sm num">
								v{status.currentVersion}
							</span>
						)}
					</h2>
					<p className="text-muted text-sm mt-0.5 num">
						{uptime ? `Running for ${uptime}` : "Uptime unknown"}
					</p>
				</div>
				<a
					className={`ml-auto inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-sm transition-colors ${
						status?.updateAvailable
							? "bg-warn-bg text-warning"
							: "text-muted hover:bg-raised hover:text-ink"
					}`}
					href="https://github.com/c4lyp5o/eziarr/releases/latest"
					target="_blank"
					rel="noreferrer noopener"
				>
					{status?.updateAvailable
						? `v${status.latestVersion} available`
						: status?.latestVersion
							? "Up to date"
							: "Releases"}
					<ArrowUpRight size={14} aria-hidden="true" />
				</a>
			</div>

			<div className="border-t border-line">
				<div className="flex items-baseline justify-between gap-2 px-5 pt-4 pb-2">
					<h3 className="text-sm font-medium">Services</h3>
					<span className="text-muted text-xs num">
						{configured} of {services.length} configured
					</span>
				</div>
				<ul className="pb-2">
					{services.map(([name, enabled]) => (
						<li
							key={name}
							className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm"
						>
							<span>{SERVICE_NAMES[name] || name}</span>
							<span
								className={`rounded px-2 py-0.5 text-xs ${
									enabled ? "bg-pos-bg text-positive" : "text-muted"
								}`}
							>
								{enabled ? "Configured" : "Not configured"}
							</span>
						</li>
					))}
				</ul>
			</div>
		</section>
	);
}
