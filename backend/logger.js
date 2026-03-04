import path from "node:path";
import deadslog from "deadslog";

const generalLogger = deadslog({
	consoleOutput: {
		enabled: true,
		coloredCoding: true,
	},
	fileOutput: {
		enabled: true,
		logFilePath: path.join(import.meta.dir, "../logs/general.log"),
	},
});

const hunterLogger = deadslog({
	consoleOutput: {
		enabled: true,
		coloredCoding: true,
	},
	fileOutput: {
		enabled: true,
		logFilePath: path.join(import.meta.dir, "../logs/hunter.log"),
	},
});

export { generalLogger, hunterLogger };
