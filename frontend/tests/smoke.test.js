// Browser smoke test: the built UI against the mock API in headless Chrome.
// Run after `bun run build`:   bun test tests/smoke.test.js
// It checks the paths a release must not break: sign-in, the virtualized
// wall, series grouping, filters, sorting, selection, shortcuts and the
// live stream (a download finishing shows a toast).
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { existsSync } from "node:fs";
import path from "node:path";

import { launch } from "./cdp.js";

const ROOT = path.join(import.meta.dir, "..");
const API_PORT = 5100 + Math.floor(Math.random() * 300);
const UI_PORT = API_PORT + 1000;
const UI = `http://localhost:${UI_PORT}`;
const COUNT = 600;

let browser;

const waitForHttp = async (url, ms = 20000) => {
	const deadline = Date.now() + ms;
	while (Date.now() < deadline) {
		try {
			if ((await fetch(url)).ok) return;
		} catch {
			// not up yet
		}
		await Bun.sleep(150);
	}
	throw new Error(`${url} did not come up`);
};

const mockState = (state) =>
	fetch(`http://localhost:${API_PORT}/api/mock/state`, {
		method: "POST",
		body: JSON.stringify(state),
	});

const click = (selectorExpr) => browser.evaluate(`(${selectorExpr}).click()`);
const byText = (selector, re) =>
	`[...document.querySelectorAll(${JSON.stringify(selector)})].find(e => ${re}.test(e.textContent))`;
// Set a React-controlled input or select the way a user's edit would.
const setValue = (selector, value) =>
	browser.evaluate(`(() => {
		const el = document.querySelector(${JSON.stringify(selector)});
		const proto = el instanceof HTMLSelectElement ? HTMLSelectElement : HTMLInputElement;
		Object.getOwnPropertyDescriptor(proto.prototype, "value").set.call(el, ${JSON.stringify(value)});
		el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
	})()`);
// Each test starts from a freshly loaded wall, so one failure can't leave
// a search, filter or dialog behind for the next.
const fresh = async () => {
	await browser.goto(UI);
	await browser.waitFor(`document.querySelectorAll("article").length`);
};
const articles = () =>
	browser.evaluate(`document.querySelectorAll("article").length`);

// Started at load, not in a hook: bun test kills processes a hook or test
// leaves running when it ends.
if (!existsSync(path.join(ROOT, "..", "client", "index.html")))
	throw new Error("Build the UI first: bun run build");
const mock = Bun.spawn(["bun", "tests/mock-api.js"], {
	cwd: ROOT,
	env: {
		...process.env,
		PORT: String(API_PORT),
		COUNT: String(COUNT),
	},
	stdout: "ignore",
	stderr: "inherit",
});
const preview = Bun.spawn(
	["bunx", "vite", "preview", "--port", String(UI_PORT), "--strictPort"],
	{
		cwd: ROOT,
		env: {
			...process.env,
			EZIARR_API: `http://localhost:${API_PORT}`,
			VITE_CONFIG_NATIVE_IGNORE_WARNING: "true",
		},
		stdout: "ignore",
		stderr: "inherit",
	},
);

beforeAll(async () => {
	await waitForHttp(`http://localhost:${API_PORT}/api/v1/me`);
	await waitForHttp(UI);
	browser = await launch();
}, 40000);

afterAll(() => {
	browser?.close();
	mock.kill();
	preview.kill();
});

describe("The wall", () => {
	it("renders only the visible part of a large library", async () => {
		await fresh();
		const n = await articles();
		expect(n).toBeGreaterThan(5);
		expect(n).toBeLessThan(120); // virtualized: nowhere near COUNT
		expect(await browser.evaluate(`document.body.textContent`)).toMatch(
			/titles missing/,
		);
	}, 20000);

	it("folds a series' episodes into one card with its episode list", async () => {
		await fresh();
		await setValue("input[type=search]", "severance");
		const series = `[...document.querySelectorAll("button")].find(b => /^Severance( \\d+)?: show 3 episodes$/.test(b.getAttribute("aria-label") || ""))`;
		await browser.waitFor(series);
		await click(series);
		await browser.waitFor(`document.querySelector('[role="dialog"]')`);
		const dialog = await browser.evaluate(
			`document.querySelector('[role="dialog"]').textContent`,
		);
		expect(dialog).toContain("S02E07");
		expect(dialog).toContain("S02E09");
		expect(dialog).toContain("Search all 3");
		await click(
			`document.querySelector('[role="dialog"] [aria-label="Close"]')`,
		);
		await browser.waitFor(`!document.querySelector('[role="dialog"]')`);
		await setValue("input[type=search]", "");
	}, 15000);

	it("keeps titles that aren't out yet behind their own filter", async () => {
		await fresh();
		await click(byText("[role=tab]", /Not out yet/));
		await browser.waitFor(byText("article h3", /^Ejen Ali 3$/));
		const text = await browser.evaluate(
			`document.querySelector("main").textContent`,
		);
		expect(text).toContain("Out Jun 10, 2027");
		await click(byText("[role=tab]", /All missing/));
		await browser.waitFor(`!${byText("article h3", /^Ejen Ali 3$/)}`);
	}, 15000);

	it("sorts by title", async () => {
		await fresh();
		await setValue("#wall-sort", "title");
		await browser.waitFor(
			`document.querySelector("article h3")?.textContent === "Abang Adik"`,
		);
	}, 10000);

	it("'/' focuses search, typing filters, Esc clears", async () => {
		await fresh();
		await browser.key("/");
		expect(
			await browser.evaluate(
				`document.activeElement.getAttribute("aria-label")`,
			),
		).toBe("Search missing titles");
		await browser.page("Input.insertText", { text: "keluang" });
		await browser.waitFor(
			`[...document.querySelectorAll("article h3")].every(h => /Keluang/.test(h.textContent))`,
		);
		await browser.key("Escape");
		await browser.waitFor(
			`document.querySelector('input[type=search]').value === ""`,
		);
		await browser.waitFor(`document.querySelectorAll("article").length > 5`);
	}, 15000);

	it("selects cards and offers bulk actions; Esc leaves", async () => {
		await fresh();
		await click(byText("button", /^Select$/));
		await browser.waitFor(`document.querySelector('[role="toolbar"]')`);
		await click(`document.querySelectorAll('[aria-label^="Select "]')[0]`);
		await click(`document.querySelectorAll('[aria-label^="Select "]')[1]`);
		await browser.waitFor(
			`/\\d+ selected/.test(document.querySelector('[role="toolbar"]').textContent)`,
		);
		const bar = await browser.evaluate(
			`document.querySelector('[role="toolbar"]').textContent`,
		);
		expect(bar).toMatch(/Search/);
		expect(bar).toMatch(/Stop monitoring/);
		await browser.key("Escape");
		await browser.waitFor(`!document.querySelector('[role="toolbar"]')`);
	}, 15000);

	it("hears about a finished download over the live stream", async () => {
		await fresh();
		const polls = async () =>
			(
				await (
					await fetch(`http://localhost:${API_PORT}/api/mock/polls`)
				).json()
			).polls;
		const before = await polls();
		await mockState({ finish: true });
		await browser.waitFor(
			`document.body.textContent.includes("Polong downloaded")`,
			20000,
		);
		// The stream, not the 10 s poll fallback: no fetch of the list since.
		expect(await polls()).toBe(before);
	}, 25000);

	// Deep search for "Tiada Tajuk" (Radarr 2133), on a fresh page.
	const openDeepSearch = async () => {
		await fresh();
		await setValue("input[type=search]", "tiada");
		const button = `document.querySelector('[aria-label="Deep search other sources for Tiada Tajuk"]')`;
		await browser.waitFor(button);
		await click(button);
		await browser.waitFor(`document.querySelector('[role="dialog"]')`);
	};

	it("shows what each indexer release is, best first", async () => {
		await openDeepSearch();
		await browser.waitFor(
			`document.querySelector('[role="dialog"]')?.textContent.includes("Camera rip")`,
		);
		const rows = await browser.evaluate(
			`[...document.querySelectorAll('[role="dialog"] li')].map(li => li.textContent)`,
		);
		// Seven results, one duplicated across two indexers.
		expect(rows).toHaveLength(6);
		expect(rows[0]).not.toMatch(/Camera rip|No seeders|Small for/);
		expect(rows.at(-1)).toContain("HDCAM");
		const dialog = rows.join(" ");
		for (const text of [
			"1080p",
			"WEB-DL",
			"Freeleech",
			"No seeders",
			"Small for 1080p",
			"Usenet",
			"MalaysiaBits, TorrentLeech",
		])
			expect(dialog).toContain(text);
	}, 20000);

	it("lets the Telegram search be edited and sends the title along", async () => {
		await openDeepSearch();
		await click(byText('[role="dialog"] [role=tab]', /Telegram/));
		await browser.waitFor(`document.getElementById("telegram-query")`);
		expect(
			await browser.evaluate(`document.getElementById("telegram-query").value`),
		).toBe("Tiada Tajuk");
		await setValue("#telegram-query", "tiada  tajuk 2019");
		await browser.evaluate(`(() => {
			const s = document.querySelector('[role="dialog"] select');
			Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(s, s.options[1].value);
			s.dispatchEvent(new Event("change", { bubbles: true }));
		})()`);
		await click(byText('[role="dialog"] button', /^Search$/));
		await browser.waitFor(
			`document.querySelector('[role="dialog"]').textContent.includes("Weak match")`,
		);
		const sent = await (
			await fetch(`http://localhost:${API_PORT}/api/mock/telegram`)
		).json();
		expect(sent).toMatchObject({
			query: "tiada  tajuk 2019",
			service: "radarr",
			serviceId: 2133,
		});
		expect(
			await browser.evaluate(
				`document.querySelector('[role="dialog"]').textContent.includes("Best match")`,
			),
		).toBe(true);
	}, 20000);

	it("logged no errors", () => {
		expect(browser.errors).toEqual([]);
	});
});

describe("Other screens", () => {
	it("shows 'All caught up' when nothing is missing", async () => {
		await mockState({ empty: true });
		await browser.goto(UI);
		await browser.waitFor(byText("h2", /All caught up/));
	}, 15000);

	it("shows the sign-in form when signed out", async () => {
		await mockState({ anon: true });
		await browser.goto(UI);
		await browser.waitFor(`document.querySelector("input#password")`);
		expect(
			await browser.evaluate(`document.querySelector("h1").textContent`),
		).toBe("Sign in");
		expect(browser.errors).toEqual([]);
	}, 15000);
});
