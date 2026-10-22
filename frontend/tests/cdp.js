// A tiny Chrome DevTools Protocol driver for the smoke test: no browser
// download, no test framework. Uses the Chrome or Chromium on the machine
// (CHROME_BIN to pick one).
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const CANDIDATES = [
	process.env.CHROME_BIN,
	"google-chrome",
	"google-chrome-stable",
	"chromium",
	"chromium-browser",
].filter(Boolean);

export const findChrome = () =>
	CANDIDATES.find((bin) => spawnSync(bin, ["--version"]).status === 0);

export const launch = async ({ width = 1440, height = 900 } = {}) => {
	const bin = findChrome();
	if (!bin) throw new Error("No Chrome found; set CHROME_BIN");
	const profile = mkdtempSync(path.join(tmpdir(), "eziarr-smoke-"));
	const port = 9400 + Math.floor(Math.random() * 400);
	const proc = spawn(
		bin,
		[
			"--headless=new",
			"--no-sandbox",
			"--disable-gpu",
			"--hide-scrollbars",
			`--remote-debugging-port=${port}`,
			`--user-data-dir=${profile}`,
			"about:blank",
		],
		{ stdio: "ignore" },
	);

	let ws;
	for (let i = 0; i < 100 && !ws; i++) {
		try {
			const res = await fetch(`http://127.0.0.1:${port}/json/version`);
			ws = new WebSocket((await res.json()).webSocketDebuggerUrl);
		} catch {
			await Bun.sleep(100);
		}
	}
	if (!ws) throw new Error("Chrome did not start");
	await new Promise((r) => ws.addEventListener("open", r));

	let id = 0;
	const pending = new Map();
	const listeners = new Set();
	ws.addEventListener("message", (e) => {
		const m = JSON.parse(e.data);
		if (m.id && pending.has(m.id)) {
			const p = pending.get(m.id);
			pending.delete(m.id);
			m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
		} else if (m.method) for (const l of listeners) l(m);
	});
	const send = (method, params = {}, sessionId) =>
		new Promise((resolve, reject) => {
			const msgId = ++id;
			pending.set(msgId, { resolve, reject });
			ws.send(JSON.stringify({ id: msgId, method, params, sessionId }));
		});

	const { targetId } = await send("Target.createTarget", {
		url: "about:blank",
	});
	const { sessionId } = await send("Target.attachToTarget", {
		targetId,
		flatten: true,
	});
	const page = (method, params) => send(method, params, sessionId);
	await page("Runtime.enable");
	await page("Page.enable");
	await page("Emulation.setDeviceMetricsOverride", {
		width,
		height,
		deviceScaleFactor: 1,
		mobile: false,
	});

	const errors = [];
	listeners.add((m) => {
		if (m.sessionId !== sessionId) return;
		if (m.method === "Runtime.exceptionThrown")
			errors.push(m.params.exceptionDetails.exception?.description ?? "error");
		if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error")
			errors.push(m.params.args.map((a) => a.value ?? a.description).join(" "));
	});

	const evaluate = async (expression) => {
		const { result, exceptionDetails } = await page("Runtime.evaluate", {
			expression,
			awaitPromise: true,
			returnByValue: true,
		});
		if (exceptionDetails) throw new Error(exceptionDetails.text);
		return result.value;
	};

	return {
		page,
		evaluate,
		errors,
		goto: (url) => page("Page.navigate", { url }),
		/** Poll a page expression until it is truthy. */
		waitFor: async (expression, ms = 10000) => {
			const deadline = Date.now() + ms;
			while (Date.now() < deadline) {
				// Coerced here: a DOM node can't be returned by value.
				const v = await evaluate(`Boolean(${expression})`).catch(() => null);
				if (v) return v;
				await Bun.sleep(100);
			}
			throw new Error(`Timed out waiting for: ${expression}`);
		},
		key: async (key, text = key.length === 1 ? key : undefined) => {
			await page("Input.dispatchKeyEvent", { type: "keyDown", key, text });
			await page("Input.dispatchKeyEvent", { type: "keyUp", key });
		},
		screenshot: async () =>
			Buffer.from((await page("Page.captureScreenshot")).data, "base64"),
		close: () => {
			ws.close();
			proc.kill();
			rmSync(profile, { recursive: true, force: true });
		},
	};
};
