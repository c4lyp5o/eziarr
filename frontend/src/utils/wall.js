// What the wall shows, as plain functions of the missing list: which titles
// are out yet, how episodes fold into their series, and the order.

/**
 * Not released yet, so no search can find it. A title with no date is
 * treated the same way: the *Arrs leave it blank until there is one (the
 * worker's automatic search skips these too).
 */
export const isUpcoming = (item, now = Date.now()) => {
	const t = Date.parse(item.releaseDate);
	return Number.isNaN(t) || t > now;
};

const time = (item) => Date.parse(item.releaseDate) || 0;

// "Severance - S2E7" (Sonarr's own) or "S02E07 · Title" → "S02E07".
export const episodeCode = (title) => {
	const m = String(title).match(/S(\d+)E(\d+)/i);
	return m
		? `S${m[1].padStart(2, "0")}E${m[2].padStart(2, "0")}`
		: String(title);
};

// Sonarr's "Series - S2E7" or a title after the code; null when only the code.
export const episodeName = (episode) => {
	const rest = String(episode.title)
		.replace(episode.seriesTitle ?? "", "")
		.replace(/S\d+E\d+/i, "")
		.replace(/^[\s\-·:]+|[\s\-·:]+$/g, "");
	return rest || null;
};

/**
 * Wall entries: a title on its own, or a series with two or more missing
 * episodes folded into one { group } entry.
 */
export const groupEpisodes = (items) => {
	const series = new Map();
	for (const item of items) {
		if (item.service !== "sonarr" || !item.seriesTitle) continue;
		const list = series.get(item.seriesTitle) ?? [];
		list.push(item);
		series.set(item.seriesTitle, list);
	}

	const entries = [];
	const placed = new Set();
	for (const item of items) {
		const episodes =
			item.service === "sonarr" ? series.get(item.seriesTitle) : null;
		if (!episodes || episodes.length < 2) {
			entries.push({ key: item.id, item });
			continue;
		}
		if (placed.has(item.seriesTitle)) continue;
		placed.add(item.seriesTitle);
		const sorted = [...episodes].sort(
			(a, b) =>
				episodeCode(a.title).localeCompare(episodeCode(b.title)) ||
				time(a) - time(b),
		);
		entries.push({
			key: `series:${item.seriesTitle}`,
			group: {
				title: item.seriesTitle,
				posterUrl: sorted.find((e) => e.posterUrl)?.posterUrl ?? null,
				episodes: sorted,
				newest: Math.max(...sorted.map(time)),
				oldest: Math.min(...sorted.map(time)),
			},
		});
	}
	return entries;
};

export const SORTS = [
	{ id: "newest", label: "Newest first" },
	{ id: "oldest", label: "Oldest first" },
	{ id: "title", label: "Title A–Z" },
];

const entryTitle = (e) =>
	e.group ? e.group.title : e.item.seriesTitle || e.item.title;
const entryNewest = (e) => (e.group ? e.group.newest : time(e.item));
const entryOldest = (e) => (e.group ? e.group.oldest : time(e.item));

export const sortEntries = (entries, sort) => {
	const byTitle = (a, b) =>
		entryTitle(a).localeCompare(entryTitle(b), undefined, {
			sensitivity: "base",
			numeric: true,
		});
	const compare =
		sort === "title"
			? byTitle
			: sort === "oldest"
				? (a, b) => entryOldest(a) - entryOldest(b) || byTitle(a, b)
				: (a, b) => entryNewest(b) - entryNewest(a) || byTitle(a, b);
	return [...entries].sort(compare);
};

/** The titles an entry stands for. */
export const entryItems = (e) => (e.group ? e.group.episodes : [e.item]);
