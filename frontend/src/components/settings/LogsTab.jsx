

export default function LogsTab({ logs, logsIsLoading, logType, setLogType, logsEndRef }) {
	return (
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
		
	);
}
