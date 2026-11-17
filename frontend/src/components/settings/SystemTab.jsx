import { Server, Cpu, Clock, Plug, ExternalLink } from "lucide-react";
import { Mark } from "../Mark";

export default function SystemTab({ status }) {
	const runtime = status?.runtime;
	const seconds = runtime?.uptimeSeconds;
	const uptime =
		seconds == null
			? "—"
			: `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
	const facts = [
		{
			label: "Runtime",
			value: runtime?.bunVersion ? `Bun ${runtime.bunVersion}` : "—",
			icon: Cpu,
		},
		{ label: "Platform", value: runtime?.platform || "—", icon: Server },
		{ label: "Server uptime", value: uptime, icon: Clock },
	];
	return (
		<div className="space-y-6">
			<section className="border border-line rounded-md p-5 bg-surface">
				<div className="flex items-center gap-3">
					<Mark size={28} />
					<div>
						<h2 className="font-semibold">
							eziarr{" "}
							<span className="text-muted font-normal text-sm">
								v{status?.currentVersion || "—"}
							</span>
						</h2>
						<p className="text-muted text-sm mt-1">
							Your media automation companion.
						</p>
					</div>
				</div>
				<dl className="grid sm:grid-cols-3 gap-5 mt-6 border-t border-line pt-5">
					{facts.map(({ label, value, icon: Icon }) => (
						<div key={label} className="min-w-0">
							<dt className="flex items-center gap-2 text-muted text-xs">
								<Icon size={14} aria-hidden="true" />
								{label}
							</dt>
							<dd className="mt-2 text-sm font-medium num">{value}</dd>
						</div>
					))}
				</dl>
			</section>
			<section className="border border-line rounded-md bg-surface">
				<div className="p-5 border-b border-line">
					<h2 className="font-semibold flex items-center gap-2">
						<Plug size={16} />
						Configured services
					</h2>
					<p className="text-muted text-sm mt-1">
						Saved configuration only—not a live health check.
					</p>
				</div>
				<ul className="divide-y divide-line">
					{Object.entries(status?.features || {}).map(([name, enabled]) => (
						<li
							key={name}
							className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm"
						>
							<span>
								{{
									radarr: "Radarr",
									sonarr: "Sonarr",
									lidarr: "Lidarr",
									prowlarr: "Prowlarr",
									telegram: "Telegram",
								}[name] || name}
							</span>
							<span className={enabled ? "text-positive" : "text-muted"}>
								{enabled ? "Configured" : "Not configured"}
							</span>
						</li>
					))}
				</ul>
			</section>
			<a
				className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink"
				href="https://github.com/c4lyp5o/eziarr/releases/latest"
				target="_blank"
				rel="noreferrer"
			>
				{status?.updateAvailable
					? `Version ${status.latestVersion} available`
					: "View releases on GitHub"}
				<ExternalLink size={14} />
			</a>
		</div>
	);
}
