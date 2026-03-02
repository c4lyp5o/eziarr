import { URL } from "node:url";
import axios from "axios";
import { isSafeUrl } from "./utils";
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

	try {
		const res = await axios.get(dirUrl, { timeout: 30000 });
		const html = res.data;

		const linkRegex = /<a\s+(?:[^>]*?\s+)?href="([^"]*)"/gi;
		const files = [];
		let match = linkRegex.exec(html);

		// biome-ignore lint/suspicious/noAssignInExpressions: i had to
		while ((match = linkRegex.exec(html)) !== null) {
			const rawLink = match[1];

			if (rawLink === "../" || rawLink === "./" || rawLink.includes("?")) {
				match = linkRegex.exec(html);
				continue;
			}

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

			match = linkRegex.exec(html);
		}

		return files;
	} catch (err) {
		logger.error("[OPENDIR] OD Scan Error: ", err);
		throw new Error("Failed to scan directory. Is the URL correct?");
	}
};
