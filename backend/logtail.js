import fs from "node:fs";

// "[INFO] [2026-10-22 08:40:12.123] - message": deadslog's line prefix. The
// timestamp sorts as text. Lines without it continue the entry above (stack
// traces).
const ENTRY_START = /^\[[A-Z]+\] \[(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{3})\]/;

/**
 * The last `maxBytes` of a file as whole lines: only the tail is read, never
 * the whole file. A missing file reads as empty.
 */
export const readTailLines = (file, maxBytes = 64 * 1024) => {
	let fd;
	try {
		fd = fs.openSync(file, "r");
	} catch (err) {
		if (err.code === "ENOENT") return [];
		throw err;
	}
	try {
		const { size } = fs.fstatSync(fd);
		const start = Math.max(0, size - maxBytes);
		const buf = Buffer.alloc(size - start);
		fs.readSync(fd, buf, 0, buf.length, start);
		const lines = buf.toString("utf-8").split("\n");
		if (start > 0) lines.shift(); // first line was cut mid-way
		return lines.filter(Boolean);
	} finally {
		fs.closeSync(fd);
	}
};

// Lines → entries, each entry its first line's timestamp plus any
// continuation lines.
const toEntries = (lines) => {
	const entries = [];
	for (const line of lines) {
		const m = ENTRY_START.exec(line);
		if (m || entries.length === 0) entries.push({ at: m?.[1] ?? "", lines: [line] });
		else entries[entries.length - 1].lines.push(line);
	}
	return entries;
};

/** The last `limit` lines across several log files, in time order. */
export const tailLogs = (files, { limit = 100, maxBytes } = {}) => {
	const entries = files.flatMap((f) => toEntries(readTailLines(f, maxBytes)));
	// Stable sort: equal timestamps keep their file order.
	entries.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
	return entries.flatMap((e) => e.lines).slice(-limit);
};
