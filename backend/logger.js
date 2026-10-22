import path from "node:path";
import deadslog from "deadslog";
import { LOG_DIR } from "./config";

// One writer per file: deadslog tracks a file's size inside its own process,
// so two processes rotating one file would leave each writing into the other's
// renamed copy. The worker therefore keeps its own general log; the Logs tab
// merges general.log and worker.log by timestamp (see logtail.js).
const isWorker = path.basename(Bun.main ?? "") === "worker.js";

const fileOutput = (name) => ({
	enabled: true,
	logFilePath: path.join(LOG_DIR, name),
	rotate: true,
	maxLogSize: 5 * 1024 * 1024,
	maxLogFiles: 3,
	onMaxLogFilesReached: "deleteOld",
});

const generalLogger = deadslog({
	consoleOutput: {
		enabled: true,
		coloredCoding: true,
	},
	fileOutput: fileOutput(isWorker ? "worker.log" : "general.log"),
});

const hunterLogger = deadslog({
	consoleOutput: {
		enabled: true,
		coloredCoding: true,
	},
	fileOutput: fileOutput("hunter.log"),
});

export { generalLogger, hunterLogger };
