import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createLogger, LOG_ROTATION } from "../ezlog.js";

const dirs = [];
const tmp = () => {
	const d = mkdtempSync(path.join(tmpdir(), "ez-log-"));
	dirs.push(d);
	return path.join(d, "logs");
};
afterEach(() => {
	for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

test("writes <name>.log in the log folder, creating it", async () => {
	const dir = tmp();
	const log = createLogger(dir, "app");
	await log.info("hello from the test");
	await log.destroy();
	expect(readFileSync(path.join(dir, "app.log"), "utf8")).toContain("hello from the test");
});

test("a pm2 cluster instance other than 0 gets its own file", async () => {
	const dir = tmp();
	const saved = process.env.NODE_APP_INSTANCE;
	process.env.NODE_APP_INSTANCE = "2";
	try {
		const log = createLogger(dir, "app");
		await log.info("instance two");
		await log.destroy();
		expect(readFileSync(path.join(dir, "app-2.log"), "utf8")).toContain("instance two");
	} finally {
		if (saved === undefined) delete process.env.NODE_APP_INSTANCE;
		else process.env.NODE_APP_INSTANCE = saved;
	}
});

test("rotates at 5 MB and keeps 3 files", () => {
	expect(LOG_ROTATION).toEqual({
		rotate: true,
		maxLogSize: 5 * 1024 * 1024,
		maxLogFiles: 3,
		onMaxLogFilesReached: "deleteOld",
	});
});
