// What a release name says about the file, read the way the *Arrs read it:
// resolution, source, codec, HDR, audio. Prowlarr returns names, not parsed
// quality, so this is what lets the deep-search list show a 1080p WEB-DL
// apart from a camera rip.

const has = (re, s) => re.test(s);

const RESOLUTIONS = [
	[/\b(2160p|4k|uhd)\b/i, "2160p", 4],
	[/\b1080[pi]\b/i, "1080p", 3],
	[/\b720p\b/i, "720p", 2],
	[/\b(480p|576p|sd)\b/i, "SD", 1],
];

const SOURCES = [
	[/\bremux\b/i, "Remux", 1.5],
	[/\b(blu-?ray|bdrip|brrip|bd25|bd50)\b/i, "BluRay", 1.2],
	[/\bweb-?dl\b/i, "WEB-DL", 1],
	[/\bweb-?rip\b/i, "WEBRip", 0.8],
	[/\bweb\b/i, "WEB", 0.9],
	[/\bhdtv\b/i, "HDTV", 0.5],
	[/\bdvd(rip|r|5|9)?\b/i, "DVD", 0.3],
];

// Recorded in a cinema: never what anyone wants, often what's seeded first.
const CAMERA =
	/\b(cam|camrip|hdcam|ts|hdts|telesync|pdvd|tc|hdtc|telecine|scr|screener|dvdscr|bdscr)\b/i;

const first = (table, s) => table.find(([re]) => re.test(s));

/** Badges and flags read from a release name. */
export const parseRelease = (title) => {
	const s = String(title ?? "").replace(/[._]/g, " ");
	const resolution = first(RESOLUTIONS, s);
	const source = first(SOURCES, s);
	const camera = has(CAMERA, s);

	const codec = has(/\b(x265|h ?265|hevc)\b/i, s)
		? "HEVC"
		: has(/\bav1\b/i, s)
			? "AV1"
			: has(/\b(x264|h ?264|avc)\b/i, s)
				? "x264"
				: null;
	const hdr = has(/\b(dv|dovi|dolby ?vision)\b/i, s)
		? "Dolby Vision"
		: has(/\bhdr10(\+|plus)\b/i, s)
			? "HDR10+"
			: has(/\bhdr(10)?\b/i, s)
				? "HDR"
				: null;
	const audio = has(/\batmos\b/i, s)
		? "Atmos"
		: has(/\btruehd\b/i, s)
			? "TrueHD"
			: has(/\bdts[ -]?(hd|x|ma)\b/i, s)
				? "DTS-HD"
				: has(/\b(ddp|dd\+|eac3|e-ac-3)/i, s)
					? "DD+"
					: has(/\bdts\b/i, s)
						? "DTS"
						: null;

	return {
		resolution: resolution?.[1] ?? null,
		source: camera ? "Camera" : (source?.[1] ?? null),
		codec,
		hdr,
		audio,
		camera,
		multi: has(/\b(multi|dual[ -]?audio)\b/i, s),
		subs: has(/\b(subs?|subbed|esubs?|msubs?|hardsub)\b/i, s),
		// For sorting: resolution and source together; a camera rip is last.
		rank: camera ? -1 : (resolution?.[2] ?? 1.5) * 10 + (source?.[2] ?? 0.6),
	};
};

// Below these a file of that resolution is probably fake, a sample or badly
// re-encoded. Episodes are much smaller than films.
const MIN_BYTES = {
	movie: { "2160p": 4e9, "1080p": 7e8, "720p": 4e8 },
	episode: { "2160p": 6e8, "1080p": 1.5e8, "720p": 8e7 },
};

/** Problems worth a warning, most serious first. */
export const releaseWarnings = (result, parsed, type) => {
	const out = [];
	if (parsed.camera) out.push("Camera rip");
	if (result.protocol !== "usenet" && result.seeders === 0)
		out.push("No seeders");
	const min = MIN_BYTES[type]?.[parsed.resolution];
	if (min && result.size > 0 && result.size < min)
		out.push(`Small for ${parsed.resolution}`);
	return out;
};

/** "3 h", "5 d", "2 mo", "3 y" since it was posted. */
export const formatAge = (publishDate, now = Date.now()) => {
	const t = Date.parse(publishDate);
	if (Number.isNaN(t)) return null;
	const hours = Math.max(0, (now - t) / 3.6e6);
	if (hours < 48) return `${Math.max(1, Math.round(hours))} h`;
	const days = hours / 24;
	if (days < 60) return `${Math.round(days)} d`;
	if (days < 730) return `${Math.round(days / 30)} mo`;
	return `${Math.round(days / 365)} y`;
};

export const RESULT_SORTS = [
	{ id: "best", label: "Best first" },
	{ id: "seeders", label: "Most seeders" },
	{ id: "newest", label: "Newest" },
	{ id: "size", label: "Largest" },
];

const key = (title) =>
	String(title)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "");

/**
 * Results ready to show: the same release on several indexers becomes one
 * row (the best-seeded copy, with every indexer listed), each row carries
 * its parsed badges and warnings, in the chosen order. "Best first" puts
 * rows with a warning last, then higher quality, then more seeders.
 */
export const rankResults = (
	results,
	{ sort = "best", type = "movie" } = {},
) => {
	const rows = new Map();
	for (const r of results) {
		const k = key(r.title);
		const row = rows.get(k);
		if (!row) {
			rows.set(k, { ...r, indexers: [r.indexer].filter(Boolean) });
			continue;
		}
		if (r.indexer && !row.indexers.includes(r.indexer))
			row.indexers.push(r.indexer);
		if ((r.seeders ?? -1) > (row.seeders ?? -1))
			Object.assign(row, { ...r, indexers: row.indexers });
	}

	const list = [...rows.values()].map((r) => {
		const parsed = parseRelease(r.title);
		return { ...r, parsed, warnings: releaseWarnings(r, parsed, type) };
	});

	const seeds = (r) => r.seeders ?? -1;
	const compare = {
		best: (a, b) =>
			(a.warnings.length > 0) - (b.warnings.length > 0) ||
			b.parsed.rank - a.parsed.rank ||
			seeds(b) - seeds(a),
		seeders: (a, b) => seeds(b) - seeds(a),
		newest: (a, b) =>
			(Date.parse(b.publishDate) || 0) - (Date.parse(a.publishDate) || 0),
		size: (a, b) => b.size - a.size,
	}[sort];
	return list.sort(compare ?? (() => 0));
};
