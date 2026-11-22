import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { dataDir, keepLegacy } from "../datadir.js";

// The upgrade guarantee: a database or folder at its pre-/data location is
// kept in use until it is moved, so an upgrade never starts on an empty DB.
// Each case builds its own tree, so the cases pass in any order (--randomize).
const roots = [];
function tree() {
	const root = mkdtempSync(path.join(tmpdir(), "ez-datadir-"));
	roots.push(root);
	return {
		root,
		fresh: path.join(root, "data", "app.sqlite"),
		old: path.join(root, "db", "app.sqlite"),
	};
}
function touch(file) {
	mkdirSync(path.dirname(file), { recursive: true });
	writeFileSync(file, "x");
}
const quiet = { warn: () => {} };
afterEach(() => {
	for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

describe("data layout", () => {
	test("uses DATA_DIR when set, else <root>/data", () => {
		const { root } = tree();
		const saved = process.env.DATA_DIR;
		try {
			process.env.DATA_DIR = "/srv/x";
			expect(dataDir(root)).toBe("/srv/x");
			delete process.env.DATA_DIR;
			expect(dataDir(root)).toBe(path.join(root, "data"));
		} finally {
			if (saved === undefined) delete process.env.DATA_DIR;
			else process.env.DATA_DIR = saved;
		}
	});
	test("a fresh install uses the new path", () => {
		const { fresh, old } = tree();
		expect(keepLegacy(fresh, [old], quiet)).toBe(fresh);
	});
	test("an existing old database keeps being used, with a warning", () => {
		const { fresh, old } = tree();
		touch(old);
		const warnings = [];
		expect(keepLegacy(fresh, [old], { warn: (m) => warnings.push(m) })).toBe(
			old,
		);
		expect(warnings[0]).toContain(old);
	});
	test("once moved, the new path wins", () => {
		const { fresh, old } = tree();
		touch(old);
		touch(fresh);
		expect(keepLegacy(fresh, [old], quiet)).toBe(fresh);
	});
	test("folders count only when they hold files (delete.me ignored)", () => {
		const { root } = tree();
		const freshDir = path.join(root, "data", "uploads");
		const oldDir = path.join(root, "uploads");
		mkdirSync(freshDir, { recursive: true });
		touch(path.join(oldDir, "delete.me"));
		expect(keepLegacy(freshDir, [oldDir], { dir: true, ...quiet })).toBe(
			freshDir,
		);
		touch(path.join(oldDir, "a.bin"));
		expect(keepLegacy(freshDir, [oldDir], { dir: true, ...quiet })).toBe(
			oldDir,
		);
	});
});
