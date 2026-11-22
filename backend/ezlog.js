// ez standard logger: deadslog to the console (docker logs) and to a rotating
// file in $DATA_DIR/logs: 5 MB per file, 3 files kept, the oldest deleted.
// One file per process: deadslog tracks a file's size inside its own process,
// so two processes rotating one file break each other's rotation. A pm2
// cluster instance other than 0 therefore writes <name>-<instance>.log.
import { mkdirSync } from "node:fs";
import path from "node:path";
import deadslog from "deadslog";

export const LOG_ROTATION = {
	rotate: true,
	maxLogSize: 5 * 1024 * 1024,
	maxLogFiles: 3,
	onMaxLogFilesReached: "deleteOld",
};

/** A logger writing to the console and to `<logDir>/<name>.log`. */
export function createLogger(logDir, name) {
	mkdirSync(logDir, { recursive: true });
	const instance = process.env.NODE_APP_INSTANCE;
	const file =
		instance && instance !== "0" ? `${name}-${instance}.log` : `${name}.log`;
	return deadslog({
		consoleOutput: { enabled: true, coloredCoding: true },
		fileOutput: {
			enabled: true,
			logFilePath: path.join(logDir, file),
			...LOG_ROTATION,
		},
	});
}
