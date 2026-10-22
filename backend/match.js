// Matching a title against file names typed by people: spacing, punctuation,
// case and accents vary ("5 cm" vs "5cm", "Shōgun" vs "Shogun"), and
// Telegram's own search only matches whole words. Two halves: which queries
// to ask Telegram for, and how well each file it returns fits the title.

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

const fold = (s) =>
	String(s ?? "")
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/&/g, " and ");

/** Lowercase letters and digits only: "5 cm", "5.CM", "5cm" → "5cm". */
export const compact = (s) => fold(s).replace(/[^\p{L}\p{N}]+/gu, "");

/** The words of a name, split on anything that isn't a letter or digit. */
export const words = (s) => fold(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

export const parseYear = (s) => {
	const m = String(s ?? "").match(/(?:^|[^\d])(19[2-9]\d|20[0-4]\d)(?!\d)/);
	return m ? Number(m[1]) : null;
};

/** S1E4, S01E04, s01.e04 or 1x04 → { season: 1, episode: 4 }. */
export const parseEpisode = (s) => {
	const str = String(s ?? "");
	const m =
		str.match(/s(\d{1,2})[\s._-]*e(\d{1,3})/i) ||
		str.match(/(?:^|[^\d])(\d{1,2})x(\d{2,3})(?!\d)/i);
	return m ? { season: Number(m[1]), episode: Number(m[2]) } : null;
};

const EPISODE_RE = /\bs\d{1,2}[\s._-]*e\d{1,3}\b|\b\d{1,2}x\d{2,3}\b/gi;
const YEAR_RE = /\(?\b(19[2-9]\d|20[0-4]\d)\b\)?/g;

/** The title part of a search query: without its episode code and year. */
export const titleOf = (query) =>
	String(query ?? "")
		.replace(EPISODE_RE, " ")
		.replace(YEAR_RE, " ")
		.replace(/[\s\-–—:]+$/g, "")
		.replace(/\s+/g, " ")
		.trim();

const STOP = new Set(["the", "and", "of", "a", "an", "to", "in"]);

/**
 * The searches worth sending for one title, most promising first, at most
 * `max`. Telegram matches whole words, so each variant is a different way a
 * person might have typed the name.
 */
export const queryVariants = (title, { episode = null, max = 6 } = {}) => {
	const code = episode
		? ` S${String(episode.season).padStart(2, "0")}E${String(episode.episode).padStart(2, "0")}`
		: "";
	const out = [];
	const add = (t) => {
		const q = `${String(t).replace(/\s+/g, " ").trim()}${code}`.trim();
		if (q && !out.includes(q)) out.push(q);
	};
	const clean = (s) => s.replace(/[!?.:,;'"()[\]{}_/\\|–—-]+/g, " ");

	const base = String(title ?? "");
	add(base);
	const cleaned = clean(base);
	add(cleaned);
	// "5 cm" → "5cm" (a number and a short word written together)...
	add(
		cleaned.replace(/\b(\d+)\s+([a-z]{1,3})\b/gi, (m, n, w) =>
			STOP.has(w.toLowerCase()) ? m : `${n}${w}`,
		),
	);
	// ...and "5cm" → "5 cm".
	add(cleaned.replace(/\b(\d+)([a-z]{1,3})\b/gi, "$1 $2"));
	add(cleaned.replace(/\s*&\s*/g, " and "));
	add(cleaned.replace(/\s+and\s+/gi, " & "));
	add(cleaned.replace(/^\s*the\s+/i, ""));
	// "Part 2" ↔ "Part II", for a part number or a trailing number only.
	const PART = /\b(part|chapter|vol(?:ume)?)\s+(\d{1,2}|[IVX]{1,4})\b|\s(\d{1,2}|[IVX]{1,4})$/i;
	add(
		cleaned.trim().replace(PART, (m, word, n1, n2) => {
			const n = n1 ?? n2;
			const swapped = /^\d+$/.test(n)
				? ROMAN[Number(n)]
				: String(ROMAN.indexOf(n.toUpperCase()));
			if (!swapped || swapped === "-1" || swapped === "0") return m;
			return word ? `${word} ${swapped}` : ` ${swapped}`;
		}),
	);
	return out.slice(0, max);
};

// Does some run of consecutive words in the file name spell the title, once
// spaces and punctuation are ignored? Catches "5 cm" in "5cm.2007.mkv" and
// "5cm" in "5 Cm (2007).mp4", without letting a short title like "Up" match
// "Upgrade".
const phraseMatch = (fileWords, target) => {
	for (let i = 0; i < fileWords.length; i++) {
		let joined = "";
		for (let j = i; j < fileWords.length && joined.length < target.length; j++) {
			joined += fileWords[j];
			if (joined === target) return true;
		}
	}
	return false;
};

/**
 * How well a file name fits a title, about 0 to 1.2. `titles` holds the
 * title and its alternates; a matching year or episode counts for it, a
 * different one counts against it.
 */
export const scoreName = (name, { titles = [], year = null, episode = null }) => {
	const fileWords = words(name);
	const fileCompact = fileWords.join("");
	let best = 0;
	for (const title of titles) {
		const target = compact(title);
		if (!target) continue;
		if (phraseMatch(fileWords, target)) {
			best = 1;
			break;
		}
		if (target.length >= 6 && fileCompact.includes(target)) {
			best = Math.max(best, 0.9);
			continue;
		}
		const titleWords = words(title).filter((w) => !STOP.has(w));
		if (!titleWords.length) continue;
		// Short words must stand alone ("5" is not in "15cm"); long ones may
		// be glued to their neighbours ("DeadReckoning").
		const fileSet = new Set(fileWords);
		const found = titleWords.filter((w) =>
			w.length >= 4 ? fileCompact.includes(w) : fileSet.has(w),
		).length;
		best = Math.max(best, (found / titleWords.length) * 0.8);
	}

	let score = best;
	if (year) {
		const fileYear = parseYear(name);
		if (fileYear === year) score += 0.15;
		else if (fileYear && Math.abs(fileYear - year) > 1) score -= 0.5;
	}
	if (episode) {
		const fileEpisode = parseEpisode(name);
		if (!fileEpisode) score -= 0.1;
		else if (
			fileEpisode.season === episode.season &&
			fileEpisode.episode === episode.episode
		)
			score += 0.2;
		else score -= 0.6;
	}
	return Math.round(Math.max(0, score) * 100) / 100;
};
