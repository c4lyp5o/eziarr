import deadslog from "deadslog";

const generalLogger = deadslog({
	consoleOutput: {
		enabled: true,
		coloredCoding: true,
	},
	fileOutput: {
		enabled: true,
		logFilePath: "logs/app.log",
	},
});

const hunterLogger = deadslog({
	consoleOutput: {
		enabled: true,
		coloredCoding: true,
	},
	fileOutput: {
		enabled: true,
		logFilePath: "logs/hunter.log",
	},
});

export { generalLogger, hunterLogger };
