// A mock of the Eziarr API for UI work and the browser smoke test. Not shipped.
//   bun tests/mock-api.js            → http://localhost:5000 (vite proxies /api here)
//   COUNT=3000   repeat the sample titles to production scale
//   EMPTY=1      nothing missing ("All caught up")
//   ANON=1       signed out (shows the sign-in screen)
//   FIRST_TIME=1 with ANON=1: the first-start setup screen
//   DONE_AFTER=5 the first download finishes after 5 s (arrival toast);
//                the smoke test finishes it on demand instead
const PORT = Number(process.env.PORT || 5000);
const EMPTY = process.env.EMPTY === "1";
let ANON = process.env.ANON === "1";
const DONE_AFTER = Number(process.env.DONE_AFTER || 0);

const items = [
	["radarr", 2099, "Polong", null, "2026-03-12", "#1c3b2e"],
	["radarr", 2133, "Tiada Tajuk", null, "2019-11-28", "#3a2418"],
	["radarr", 2283, "Keluang Man", null, "2026-06-04", "#14233d"],
	["radarr", 1987, "Abang Adik", null, "2023-11-16", "#33302a"],
	["radarr", 2310, "Ejen Ali: The Movie 2", null, "2025-05-22", "#0f2f45"],
	["radarr", 1802, "Mat Kilau", null, "2022-06-23", "#3d1f12"],
	["radarr", 2051, "Sheriff: Narko Integriti", null, "2024-05-30", "#202020"],
	["radarr", 2342, "Mechamato Movie", null, "2022-12-08", "#2a1240"],
	["sonarr", 88411, "Severance - S2E7", "Severance", "2025-02-28", "#22303a"],
	["sonarr", 88412, "Severance - S2E8", "Severance", "2025-03-07", "#22303a"],
	["sonarr", 88413, "Severance - S2E9", "Severance", "2025-03-14", "#22303a"],
	["sonarr", 90120, "Andor - S2E3", "Andor", "2025-04-22", "#2d2a1f"],
	["sonarr", 77310, "Shōgun - S1E10", "Shōgun", "2024-04-23", "#3b1414"],
	[
		"sonarr",
		93001,
		"Projek: Anchor - S1E4",
		"Projek: Anchor",
		"2026-09-30",
		"#18282a",
	],
	[
		"sonarr",
		93002,
		"Projek: Anchor - S1E5",
		"Projek: Anchor",
		"2027-01-07",
		"#18282a",
	],
	["radarr", 2400, "Ejen Ali 3", null, "2027-06-10", "#0f2f45"],
	["lidarr", 560, "Untitled", "Hindia", null, "#2f2a1a"],
	[
		"lidarr",
		512,
		"Lagipula Hidup Akan Berakhir",
		"Hindia",
		"2023-07-14",
		"#2f2a1a",
	],
	["lidarr", 533, "Glow", "Yuna", "2026-08-01", "#3a1c2c"],
	["lidarr", 540, "Legenda", "Sheila Majid", "1990-10-01", "#2a2a36"],
].map(([service, serviceId, title, seriesTitle, releaseDate, hue], i) => ({
	id: `${service}-${serviceId}`,
	serviceId,
	service,
	title,
	seriesTitle,
	type:
		service === "radarr" ? "movie" : service === "sonarr" ? "episode" : "album",
	releaseDate,
	posterUrl: i === 6 ? null : `/api/mock/poster/${service}-${serviceId}.svg`,
	status: "missing",
	_hue: hue,
}));

// COUNT=3000 repeats the sample titles to size a production-scale wall.
const COUNT = Number(process.env.COUNT || items.length);
let missing = EMPTY
	? []
	: Array.from({ length: COUNT }, (_, n) => {
			const { _hue, ...rest } = items[n % items.length];
			if (n < items.length) return rest;
			// Copies are their own series, so they fold like a real library.
			const copy = Math.floor(n / items.length);
			return {
				...rest,
				id: `${rest.id}-${n}`,
				serviceId: rest.serviceId * 1000 + n,
				...(rest.seriesTitle
					? {
							seriesTitle: `${rest.seriesTitle} ${copy}`,
							title: rest.title.replace(
								rest.seriesTitle,
								`${rest.seriesTitle} ${copy}`,
							),
						}
					: {}),
			};
		});

const started = Date.now();
// A download finishes the way it does in production: it leaves the queue
// when the *Arr imports it, and the missing list only at the next sync.
let finished = false;
let finishNow = false;
let finishedAt = 0;
let polls = 0;
let lastTelegramSearch = null;
const queue = () => {
	const t = (Date.now() - started) / 1000;
	if ((finishNow || (DONE_AFTER && t > DONE_AFTER)) && !finished) {
		finished = true;
		finishedAt = t;
	}
	if (finished && t - finishedAt > 3)
		missing = missing.filter((m) => m.id !== "radarr-2099");
	return EMPTY
		? []
		: [
				...(finished
					? []
					: [
							{
								service: "eziarr",
								serviceId: 2099,
								status: "downloading",
								trackStatus: "ok",
								title: "Polong (2026).mp4",
								progress: Math.min(99, 34 + Math.floor(t / 3)),
								timeleft: "",
							},
						]),
				{
					service: "radarr",
					serviceId: 1987,
					status: "downloading",
					trackStatus: "ok",
					title: "Abang.Adik.2023.1080p.WEB-DL",
					quality: "WEBDL-1080p",
					progress: Math.min(99, 72 + Math.floor(t / 6)),
					timeleft: "00:12:40",
				},
				{
					service: "sonarr",
					serviceId: 88411,
					status: "warning",
					trackStatus: "warning",
					title: "Severance.S02E07.1080p",
					quality: "WEBDL-1080p",
					progress: 41,
					timeleft: "",
				},
				{
					service: "eziarr",
					serviceId: 2310,
					status: "pending",
					trackStatus: "ok",
					title: "Ejen Ali The Movie 2 (2025).mkv",
					progress: null,
					timeleft: "",
				},
			];
};

const esc = (s) =>
	String(s).replace(
		/[&<>"]/g,
		(c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
	);
const poster = (id) => {
	const item = items.find((i) => i.id === id);
	if (!item) return null;
	const name = item.seriesTitle || item.title;
	const words = name.split(/\s+/);
	const lines = [];
	for (const w of words) {
		const last = lines[lines.length - 1];
		if (last && `${last} ${w}`.length <= 11)
			lines[lines.length - 1] = `${last} ${w}`;
		else lines.push(w);
	}
	const year = item.releaseDate?.slice(0, 4) ?? "";
	const text = lines
		.slice(0, 4)
		.map(
			(l, i) =>
				`<text x="28" y="${400 + i * 52}" font-family="Inter, Arial, sans-serif" font-size="46" font-weight="700" fill="#f4efe6">${esc(l)}</text>`,
		)
		.join("");
	return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">
<rect width="400" height="600" fill="${item._hue}"/>
<circle cx="300" cy="170" r="120" fill="#ffffff" fill-opacity="0.07"/>
<rect x="28" y="40" width="60" height="6" fill="#f4efe6" fill-opacity="0.6"/>
${text}
<text x="28" y="570" font-family="Inter, Arial, sans-serif" font-size="20" fill="#f4efe6" fill-opacity="0.7">${year}</text>
</svg>`;
};

const now = Date.now();
const history = [
	{
		id: "h1",
		type: "telegram",
		service: "radarr",
		filename: "Tiada Tajuk (2019).mp4",
		status: "failed",
		last_error:
			"Tiada Tajuk (2019).mp4 downloaded but radarr never imported it: Scan imported nothing for movie 2133 within 120s",
		download_bytes: 1874219008,
		duration_ms: 412000,
		finished_at: now - 3.6e6,
	},
	{
		id: "h2",
		type: "http",
		service: "radarr",
		filename: "Mat Kilau (2022).mkv",
		status: "completed",
		last_error: null,
		download_bytes: 4283416576,
		duration_ms: 1260000,
		finished_at: now - 8.1e6,
	},
	{
		id: "h3",
		type: "telegram",
		service: "sonarr",
		filename: "Projek Anchor S01E03.mp4",
		status: "completed",
		last_error: null,
		download_bytes: 912261120,
		duration_ms: 188000,
		finished_at: now - 26e6,
	},
];

const json = (data, status = 200) => Response.json(data, { status });

Bun.serve({
	port: PORT,
	async fetch(req) {
		const url = new URL(req.url);
		const p = url.pathname;
		// Test hooks: how often the list was polled, and state switches:
		// POST /api/mock/state {"anon":true} or {"empty":true}.
		if (p === "/api/mock/polls") return json({ polls });
		if (p === "/api/mock/telegram") return json(lastTelegramSearch);
		if (p === "/api/mock/state" && req.method === "POST") {
			const body = await req.json();
			if ("anon" in body) ANON = Boolean(body.anon);
			if (body.empty) missing = [];
			if (body.finish) finishNow = true;
			return json({ ok: true });
		}
		if (p.startsWith("/api/mock/poster/")) {
			const svg = poster(p.slice(17, -4));
			return svg
				? new Response(svg, { headers: { "content-type": "image/svg+xml" } })
				: new Response("", { status: 404 });
		}
		switch (p) {
			case "/api/v1/me":
				return ANON ? json({ error: "Unauthorized" }, 401) : json({ ok: true });
			case "/api/v1/firsttime":
				return json({
					isFirstTime: process.env.FIRST_TIME === "1",
				});
			case "/api/v1/login":
				return json({ error: "Wrong password" }, 401);
			case "/api/v1/logout":
			case "/api/v1/refresh":
				return json({ success: true });
			case "/api/v1/system/status":
				return json({
					isSetup: true,
					updateAvailable: false,
					latestVersion: "1.4.0",
					features: { prowlarr: true, telegram: true },
				});
			case "/api/v1/missing":
				polls += 1;
				return json({ success: true, missing, queue: queue() });
			case "/api/v1/missing/search":
				return json({ success: true });
			case "/api/v1/missing/bulk": {
				const body = await req.json();
				const keys = new Set(
					body.items.map((i) => `${i.service}:${Number(i.serviceId)}`),
				);
				if (body.action === "unmonitor")
					missing = missing.filter(
						(m) => !keys.has(`${m.service}:${m.serviceId}`),
					);
				const n = body.items.length;
				return json({
					success: true,
					done: n,
					failed: [],
					message: `${body.action === "search" ? "Search started for" : "Stopped monitoring"} ${n} ${n === 1 ? "title" : "titles"}`,
				});
			}
			case "/api/v1/missing/stream": {
				// Same contract as the server: `missing` and `queue` when they change.
				let timer;
				const enc = new TextEncoder();
				const sent = {};
				return new Response(
					new ReadableStream({
						start(c) {
							const push = () => {
								const q = JSON.stringify({ queue: queue(), unavailable: [] });
								const m = JSON.stringify(missing);
								if (m !== sent.m) {
									sent.m = m;
									c.enqueue(enc.encode(`event: missing\ndata: ${m}\n\n`));
								}
								if (q !== sent.q) {
									sent.q = q;
									c.enqueue(enc.encode(`event: queue\ndata: ${q}\n\n`));
								}
								c.enqueue(enc.encode(": ping\n\n"));
							};
							push();
							timer = setInterval(push, 2000);
						},
						cancel() {
							clearInterval(timer);
						},
					}),
					{
						headers: {
							"Content-Type": "text/event-stream",
							"Cache-Control": "no-cache",
						},
					},
				);
			}
			case "/api/v1/missing/unmonitor": {
				const body = await req.json();
				missing = missing.filter(
					(m) =>
						!(
							m.service === body.service &&
							Number(m.serviceId) === Number(body.serviceId)
						),
				);
				return json({ success: true });
			}
			case "/api/v1/missing/deepsearch": {
				const ago = (h) => new Date(Date.now() - h * 3.6e6).toISOString();
				const t = (o) => ({
					leechers: 2,
					grabs: 40,
					protocol: "torrent",
					freeleech: false,
					infoUrl: null,
					downloadUrl: "x",
					...o,
				});
				return json({
					success: true,
					torrents: [
						t({
							guid: "cam",
							title: "Tiada.Tajuk.2019.HDCAM.x264-NOGRP",
							size: 912261120,
							seeders: 310,
							indexer: "1337x",
							publishDate: ago(30),
							grabs: 2400,
						}),
						t({
							guid: "a",
							title: "Tiada.Tajuk.2019.1080p.WEB-DL.DDP5.1.H.264-MALAY",
							size: 4294967296,
							seeders: 48,
							leechers: 5,
							indexer: "MalaysiaBits",
							publishDate: ago(52),
							grabs: 310,
							freeleech: true,
							infoUrl: "https://tracker.example/details/1",
						}),
						t({
							guid: "a2",
							title: "Tiada Tajuk 2019 1080p WEB-DL DDP5.1 H.264-MALAY",
							size: 4294967296,
							seeders: 21,
							indexer: "TorrentLeech",
							publishDate: ago(50),
						}),
						t({
							guid: "b",
							title: "Tiada.Tajuk.2019.720p.WEBRip.x264-HMM",
							size: 1073741824,
							seeders: 7,
							indexer: "1337x",
							publishDate: ago(400),
						}),
						t({
							guid: "c",
							title: "Tiada.Tajuk.2019.2160p.NF.WEB-DL.DV.HDR.Atmos.H.265",
							size: 9663676416,
							seeders: 0,
							leechers: 0,
							indexer: "TorrentLeech",
							publishDate: ago(900),
						}),
						t({
							guid: "d",
							title: "Tiada.Tajuk.2019.1080p.WEB.x265",
							size: 314572800,
							seeders: 95,
							indexer: "1337x",
							publishDate: ago(20),
						}),
						t({
							guid: "u",
							title: "Tiada.Tajuk.2019.1080p.BluRay.x264-NZB",
							size: 8589934592,
							seeders: null,
							leechers: null,
							grabs: 12,
							protocol: "usenet",
							indexer: "NZBgeek",
							publishDate: ago(2000),
						}),
					],
				});
			}
			case "/api/v1/missing/forcegrab":
				return json({ success: true, message: "Grabbed successfully" });
			case "/api/v1/settings":
				return json({
					settings: {
						password: "",
						confirmPassword: "",
						syncEnabled: true,
						hunterEnabled: true,
						syncInterval: 10,
						hunterInterval: 15,
						radarrConfigured: true,
						sonarrConfigured: true,
						lidarrConfigured: false,
						prowlarrConfigured: true,
						telegramConfigured: true,
						radarrUrl: "http://192.168.1.20:7878",
						radarrApiKey: "",
						sonarrUrl: "http://192.168.1.20:8989",
						sonarrApiKey: "",
						lidarrUrl: "",
						lidarrApiKey: "",
						prowlarrUrl: "http://192.168.1.20:9696",
						prowlarrApiKey: "",
						telegramApiId: "",
						telegramApiHash: "",
						pathMapRemote: "D:\\Eziarr",
					},
				});
			case "/api/v1/system/tasks":
				return json({
					tasks: [
						{
							id: "job-1",
							type: "Download",
							status: "running",
							message: "Downloading: Polong (2026).mp4",
							progress: queue()[0]?.progress ?? 0,
							updated_at: Date.now(),
						},
					],
				});
			case "/api/v1/downloads/queue":
				return json({
					queue: [
						{
							id: "job-1",
							type: "telegram",
							status: "downloading",
							created_at: now - 6e5,
							payload: JSON.stringify({
								filename: "Polong (2026).mp4",
								service: "radarr",
							}),
							message: "Downloading",
							next_attempt: null,
							last_error: null,
						},
						{
							id: "job-2",
							type: "http",
							status: "retry",
							created_at: now - 9e5,
							payload: JSON.stringify({
								filename: "Ejen Ali The Movie 2 (2025).mkv",
								service: "radarr",
							}),
							message: null,
							next_attempt: now + 12e4,
							last_error: "ECONNRESET",
						},
					],
				});
			case "/api/v1/downloads/history":
				return json({ history });
			case "/api/v1/downloads/stats":
				return json({
					stats: [
						{
							service: "radarr",
							total: 14,
							completed: 12,
							failed: 2,
							bytes: 31457280000,
							avg_duration_ms: 640000,
						},
						{
							service: "sonarr",
							total: 9,
							completed: 9,
							failed: 0,
							bytes: 8589934592,
							avg_duration_ms: 210000,
						},
					],
				});
			case "/api/v1/system/logs":
				return json({
					logs: [
						"[INFO] [2026-10-22 08:40:12] - [WORKER] ♻️ Reusing downloaded file, retrying import only: /app/downloads/Tiada Tajuk (2019).mp4",
						"[WARN] [2026-10-22 08:42:13] - [WORKER] ❌ Download Job Failed: Tiada Tajuk (2019).mp4 downloaded but radarr never imported it",
						"[INFO] [2026-10-22 09:01:55] - [WORKER] ✅ Import verified: movie 1802 now has a file.",
					],
				});
			case "/api/v1/telegram/status":
				return json({
					connected: true,
					channels: [
						{ id: -100123, title: "Filem Melayu HD" },
						{ id: -100456, title: "Drama Bersiri" },
					],
				});
			case "/api/v1/telegram/search": {
				// Echoes the query so the smoke test can see what was sent.
				const sent = await req.json();
				lastTelegramSearch = sent;
				return json({
					files: [
						{
							id: 594,
							messageId: 594,
							channel: "-100123",
							filename: "Tiada Tajuk (2019) 1080p.mp4",
							size: 2254857830,
							date: 1711000000,
							messageText: "Tiada Tajuk (2019) 1080p WEB-DL",
						},
						{
							id: 601,
							messageId: 601,
							channel: "-100123",
							filename: "Tiada Tajuk (2019) 720p.mkv",
							size: 1181116006,
							date: 1711500000,
							messageText: "Tiada Tajuk 720p",
						},
						{
							id: 640,
							messageId: 640,
							channel: "-100456",
							filename: "Tajuk Lain (2015).mkv",
							size: 981116006,
							date: 1711600000,
							messageText: "",
						},
					].map((f, i) => ({
						...f,
						channelTitle:
							f.channel === "-100123" ? "Filem Melayu HD" : "Drama Bersiri",
						score: [1.15, 0.95, 0.2][i],
					})),
				});
			}
			case "/api/v1/ia/search":
				return json({
					success: true,
					files: [
						{
							id: "tiada-tajuk-2019",
							title: "Tiada Tajuk (2019)",
							year: "2019",
							downloads: 1840,
							detailsUrl: "https://archive.org/details/tiada-tajuk-2019",
						},
						{
							id: "filem-melayu-klasik-1974",
							title: "Filem Melayu Klasik: Tiada Tajuk (1974)",
							year: "1974",
							downloads: 912,
							detailsUrl:
								"https://archive.org/details/filem-melayu-klasik-1974",
						},
					],
				});
			case "/api/v1/opendir/scan":
				return json({
					success: true,
					files: [
						{
							filename: "Tiada Tajuk (2019) 1080p.mkv",
							downloadUrl:
								"http://files.example.net/movies/Tiada%20Tajuk%20(2019)%201080p.mkv",
							ext: ".mkv",
						},
						{
							filename: "Tiada Tajuk (2019) 720p.mp4",
							downloadUrl:
								"http://files.example.net/movies/Tiada%20Tajuk%20(2019)%20720p.mp4",
							ext: ".mp4",
						},
					],
				});
			default:
				if (p.startsWith("/api/v1/ia/files/"))
					return json({
						success: true,
						filesInside: [
							{
								filename: "Tiada_Tajuk_2019.mp4",
								size: "1932735283",
								format: "MPEG4",
								downloadUrl:
									"https://ia800.us.archive.org/1/items/tiada-tajuk-2019/Tiada_Tajuk_2019.mp4",
							},
						],
					});
				return json({ error: "not mocked" }, 404);
		}
	},
});
console.log(`mock api on :${PORT}${EMPTY ? " (empty)" : ""}`);
