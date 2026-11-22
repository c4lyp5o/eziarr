// ez standard data layout: every piece of state lives under DATA_DIR (/data in
// the image, <repo>/data when run from source). A database or folder still at
// its pre-/data location keeps being used, with a warning, until it is moved,
// so an upgrade never starts on an empty database. Nothing is copied
// automatically: with an old compose file /data is not a mount, and a copy
// there would be lost on the next recreate.
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

/** DATA_DIR, or `<appRoot>/data` when it is not set. */
export function dataDir(appRoot) {
	return path.resolve(process.env.DATA_DIR || path.join(appRoot, "data"));
}

/** `preferred`, unless it has nothing in it yet and a legacy path does. */
export function keepLegacy(
	preferred,
	legacy,
	{ dir = false, warn = console.warn } = {},
) {
	if (hasState(preferred, dir)) return preferred;
	// An old file or folder that exists is still in use. Folders count even when
	// empty: the image never creates the old ones, so one only exists when it is
	// mounted, and new data must keep going there rather than into an unmounted
	// /data that is lost on the next recreate.
	const old = legacy.find((p) => p && p !== preferred && existsSync(p));
	if (!old) return preferred;
	warn(
		`[data] still using ${old}; move it to ${preferred} (see CHANGELOG, "Upgrading").`,
	);
	return old;
}

function hasState(p, dir) {
	if (!existsSync(p)) return false;
	if (!dir) return true;
	try {
		return readdirSync(p).some((f) => f !== "delete.me" && !f.startsWith("."));
	} catch {
		return false;
	}
}
