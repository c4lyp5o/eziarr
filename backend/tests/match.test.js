import { describe, it, expect } from "vitest";
import {
	compact,
	parseEpisode,
	parseYear,
	queryVariants,
	scoreName,
	titleOf,
} from "../match.js";

describe("Name normalisation", () => {
	it("ignores spacing, punctuation, case and accents", () => {
		expect(compact("5 cm")).toBe(compact("5.CM"));
		expect(compact("5 cm")).toBe("5cm");
		expect(compact("Shōgun")).toBe("shogun");
		expect(compact("Fast & Furious")).toBe(compact("Fast and Furious"));
	});

	it("reads years and episode codes in the forms people write them", () => {
		expect(parseYear("5cm.2007.1080p.mkv")).toBe(2007);
		expect(parseYear("Movie.2160p.mkv")).toBeNull();
		expect(parseEpisode("Severance.S02E07.mkv")).toEqual({ season: 2, episode: 7 });
		expect(parseEpisode("Severance S2E7")).toEqual({ season: 2, episode: 7 });
		expect(parseEpisode("severance 2x07")).toEqual({ season: 2, episode: 7 });
		expect(titleOf("Severance S2E7")).toBe("Severance");
		expect(titleOf("Polong (2026)")).toBe("Polong");
	});
});

describe("Telegram query variants", () => {
	it('tries "5 cm" both together and apart', () => {
		expect(queryVariants("5 cm")).toContain("5cm");
		expect(queryVariants("5cm")).toContain("5 cm");
	});

	it("pads the episode code the way release names write it", () => {
		expect(
			queryVariants("Severance", { episode: { season: 2, episode: 7 } }),
		).toEqual(["Severance S02E07"]);
	});

	it("tries a part number as a Roman numeral and back", () => {
		const v = queryVariants("Dead Reckoning Part 1", { max: 10 });
		expect(v).toContain("Dead Reckoning Part I");
		expect(queryVariants("Rocky II", { max: 10 })).toContain("Rocky 2");
	});

	it("drops punctuation and stays within the budget", () => {
		const v = queryVariants("Mission: Impossible – Dead Reckoning", { max: 3 });
		expect(v.length).toBeLessThanOrEqual(3);
		expect(v).toContain("Mission Impossible Dead Reckoning");
	});
});

describe("Ranking a file against a title", () => {
	const fiveCm = { titles: ["5 cm"], year: 2007 };

	it('matches "5cm" and "5 Cm" to "5 cm"', () => {
		expect(scoreName("5cm.2007.1080p.mkv", fiveCm)).toBeGreaterThanOrEqual(1);
		expect(scoreName("5 Cm (2007).mp4", fiveCm)).toBeGreaterThanOrEqual(1);
	});

	it("doesn't match a number inside a longer word", () => {
		expect(scoreName("15cm.mkv", fiveCm)).toBe(0);
		expect(scoreName("Upgrade.2018.mkv", { titles: ["Up"], year: 2009 })).toBe(0);
	});

	it("ranks a different year below the right one", () => {
		expect(scoreName("5cm (2010).mkv", fiveCm)).toBeLessThan(
			scoreName("5cm (2007).mkv", fiveCm),
		);
	});

	it("ranks the wrong episode far below the right one", () => {
		const ctx = { titles: ["Severance"], episode: { season: 2, episode: 7 } };
		expect(scoreName("Severance.S02E07.1080p.mkv", ctx)).toBeGreaterThan(1);
		expect(scoreName("Severance S02E08.mkv", ctx)).toBeLessThan(0.5);
	});

	it("matches an alternate title", () => {
		const ctx = {
			titles: ["5 Centimeters per Second", "Byousoku 5 Centimeter"],
			year: 2007,
		};
		expect(scoreName("Byousoku.5.Centimeter.2007.mkv", ctx)).toBeGreaterThanOrEqual(1);
	});
});
