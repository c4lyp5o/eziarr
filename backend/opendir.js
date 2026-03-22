import { URL } from "node:url";
import axios from "axios";
import { isSafeUrl, safeHttpAgent, safeHttpsAgent } from "./utils";
import { generalLogger as logger } from "./logger";

const VIDEO_EXTENSIONS = new Set([
	".mkv",
	".mp4",
	".avi",
	".mov",
	".wmv",
	".flv",
	".webm",
	".m4v",
]);

export const scanOpenDir = async (dirUrl) => {
	if (!(await isSafeUrl(dirUrl)))
		throw new Error("Invalid or unsafe URL provided.");

	logger.info(`[OPENDIR] Scanning ${dirUrl}`);

	const res = await axios({
		url: dirUrl,
		method: "GET",
		responseType: "text",
		timeout: 30000,
		maxRedirects: 0,
		httpAgent: safeHttpAgent,
		httpsAgent: safeHttpsAgent,
		validateStatus: (status) => status >= 200 && status < 300,
	});

	const html = res.data;

	const linkRegex = /<a\s+(?:[^>]*?\s+)?href="([^"]*)"/gi;
	const files = [];

	let match;
	// biome-ignore lint/suspicious/noAssignInExpressions: i had to
	while ((match = linkRegex.exec(html)) !== null) {
		const rawLink = match[1];

		if (rawLink === "../" || rawLink === "./" || rawLink.includes("?"))
			continue;

		const absoluteUrl = new URL(rawLink, dirUrl).href;

		const ext = absoluteUrl
			.substring(absoluteUrl.lastIndexOf("."))
			.toLowerCase();

		if (VIDEO_EXTENSIONS.has(ext)) {
			const filename = decodeURIComponent(
				rawLink.split("/").pop() || "Unknown",
			);

			files.push({
				filename: filename,
				downloadUrl: absoluteUrl,
				ext: ext,
			});
		}
	}

	return files;
};
