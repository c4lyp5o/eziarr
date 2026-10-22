// Preloaded by `bun test` (bunfig.toml) before any test file imports the
// app: point the database, logs and downloads at a fresh temp directory so a
// test run never reads or wipes the real data in ../db.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll } from "bun:test";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "eziarr-test-"));
for (const [env, dir] of [
	["EZIARR_DB_DIR", "db"],
	["EZIARR_LOG_DIR", "logs"],
	["EZIARR_DOWNLOAD_DIR", "downloads"],
]) {
	process.env[env] = path.join(root, dir);
	fs.mkdirSync(process.env[env], { recursive: true });
}

// Registered from the preload, this runs once after every test file.
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
