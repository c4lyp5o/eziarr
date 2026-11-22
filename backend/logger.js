import path from "node:path";
import { LOG_DIR } from "./config";
import { createLogger } from "./ezlog.js";

// One writer per file: the worker keeps its own general log; the Logs tab
// merges general.log and worker.log by timestamp (see logtail.js). Under PM2
// every entry point is PM2's wrapper, so the role comes from EZIARR_ROLE (set
// in ecosystem.config.js); Bun.main covers running worker.js directly.
const isWorker =
	process.env.EZIARR_ROLE === "worker" ||
	path.basename(Bun.main ?? "") === "worker.js";

const generalLogger = createLogger(LOG_DIR, isWorker ? "worker" : "general");
const hunterLogger = createLogger(LOG_DIR, "hunter");

export { generalLogger, hunterLogger };
