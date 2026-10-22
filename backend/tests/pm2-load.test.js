import { it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// PM2 starts each app with `require(<script>)` (ProcessContainerForkBun.js),
// not as an ES module entry point. Bun refuses to require() a module whose
// top-level await really suspends, so a top-level `await` in index.js
// crash-looped the server whenever EZIARR_PASSWORD made first boot hash a
// password. Load it exactly the way PM2 does.
it("Should start when loaded with require(), as PM2 does", async () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "eziarr-pm2-"));
	const dirs = Object.fromEntries(
		["db", "logs", "downloads"].map((d) => {
			const p = path.join(root, d);
			fs.mkdirSync(p);
			return [d, p];
		}),
	);
	const entry = path.join(import.meta.dir, "..", "index.js");

	const proc = Bun.spawn(["bun", "-e", `require(${JSON.stringify(entry)})`], {
		env: {
			...process.env,
			EZIARR_DB_DIR: dirs.db,
			EZIARR_LOG_DIR: dirs.logs,
			EZIARR_DOWNLOAD_DIR: dirs.downloads,
			EZIARR_PASSWORD: "pm2-load-test-pass",
			PORT: "0",
		},
		stdout: "pipe",
		stderr: "pipe",
	});

	let output = "";
	const read = async (stream) => {
		for await (const chunk of stream) output += new TextDecoder().decode(chunk);
	};
	read(proc.stdout);
	read(proc.stderr);

	try {
		const deadline = Date.now() + 15000;
		while (Date.now() < deadline && !/is running at|error/i.test(output))
			await Bun.sleep(50);
		expect(output).not.toContain("require() async module");
		expect(output).toContain("is running at");
	} finally {
		proc.kill();
		await proc.exited;
		fs.rmSync(root, { recursive: true, force: true });
	}
}, 20000);
