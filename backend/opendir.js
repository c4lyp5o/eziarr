import axios from "axios";
import { URL } from "node:url";

// Common video extensions to look for
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

const isSafeUrl = (urlString) => {
	try {
		const url = new URL(urlString);
		if (url.protocol !== "http:" && url.protocol !== "https:") return false;
		if (url.hostname === "localhost" || url.hostname === "127.0.0.1")
			return false;
		return true;
	} catch (err) {
		console.warn(
			`Invalid URL provided: ${urlString}. Error: ${err.toString()}`,
		);
		return false;
	}
};

export const scanOpenDir = async (dirUrl) => {
	if (!isSafeUrl(dirUrl)) {
		throw new Error("Invalid or unsafe URL provided.");
	}

	try {
		// 1. Fetch HTML
		const res = await axios.get(dirUrl, { timeout: 15000 });
		const html = res.data;

		// 2. Parse Links (Regex is fast/safe enough for standard Apache/Nginx indexes)
		// Looking for <a href="...">
		const linkRegex = /<a\s+(?:[^>]*?\s+)?href="([^"]*)"/gi;
		const files = [];
		let match = linkRegex.exec(html);

		// biome-ignore lint/suspicious/noAssignInExpressions: i had to
		while ((match = linkRegex.exec(html)) !== null) {
			const rawLink = match[1];

			// Skip parent directory links
			if (rawLink === "../" || rawLink === "./" || rawLink.includes("?")) {
				match = linkRegex.exec(html);
				continue;
			}

			// 3. Resolve Absolute URL
			const absoluteUrl = new URL(rawLink, dirUrl).href;

			// 4. Check Extension
			const ext = absoluteUrl
				.substring(absoluteUrl.lastIndexOf("."))
				.toLowerCase();

			if (VIDEO_EXTENSIONS.has(ext)) {
				// Decode URI components (remove %20 etc) for display
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
		console.error("OD Scan Error:", err);
		throw new Error("Failed to scan directory. Is the URL correct?");
	}
};
