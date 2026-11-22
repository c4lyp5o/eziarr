import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { dataDir, keepLegacy } from "../datadir.js";

// The upgrade guarantee: a database or folder at its pre-/data location is
// kept in use until it is moved, so an upgrade never starts on an empty DB.
describe("data layout", () => {
	const root = mkdtempSync(path.join(tmpdir(), "ez-datadir-"));
	const fresh = path.join(root, "data", "app.sqlite");
	const old = path.join(root, "db", "app.sqlite");
	const quiet = { warn: () => {} };

	test("uses DATA_DIR when set, else <root>/data", () => {
		const saved = process.env.DATA_DIR;
		process.env.DATA_DIR = "/srv/x";
		expect(dataDir(root)).toBe("/srv/x");
		delete process.env.DATA_DIR;
		expect(dataDir(root)).toBe(path.join(root, "data"));
		if (saved !== undefined) process.env.DATA_DIR = saved;
	});
	test("a fresh install uses the new path", () => {
		expect(keepLegacy(fresh, [old], quiet)).toBe(fresh);
	});
	test("an existing old database keeps being used, with a warning", () => {
		mkdirSync(path.dirname(old), { recursive: true });
		writeFileSync(old, "x");
		const warnings = [];
		expect(keepLegacy(fresh, [old], { warn: (m) => warnings.push(m) })).toBe(old);
		expect(warnings[0]).toContain(old);
	});
	test("once moved, the new path wins", () => {
		mkdirSync(path.dirname(fresh), { recursive: true });
		writeFileSync(fresh, "x");
		expect(keepLegacy(fresh, [old], quiet)).toBe(fresh);
	});
	test("folders count only when they hold files (delete.me ignored)", () => {
		const freshDir = path.join(root, "data", "uploads");
		const oldDir = path.join(root, "uploads");
		mkdirSync(freshDir, { recursive: true });
		mkdirSync(oldDir, { recursive: true });
		writeFileSync(path.join(oldDir, "delete.me"), "");
		expect(keepLegacy(freshDir, [oldDir], { dir: true, ...quiet })).toBe(freshDir);
		writeFileSync(path.join(oldDir, "a.bin"), "x");
		expect(keepLegacy(freshDir, [oldDir], { dir: true, ...quiet })).toBe(oldDir);
		rmSync(root, { recursive: true, force: true });
	});
});
