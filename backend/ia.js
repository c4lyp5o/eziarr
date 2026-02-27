import axios from "axios";
import { generalLogger as logger } from "./logger";

const IA_BASE = "https://archive.org/advancedsearch.php";

export const searchInternetArchive = async (query) => {
	try {
		// Construct Lucene-style query
		// title:(Matrix) AND mediaType:(movies) AND format:(MPEG4 OR Matroska OR H.264)
		const q = `title:(${query}) AND mediaType:(movies) AND (format:MPEG4 OR format:Matroska OR format:h.264 OR format:Unknown)`;

		const params = {
			q: q,
			fl: ["identifier", "title", "year", "format", "downloads"], // Fields to return
			sort: ["downloads desc"], // Sort by popularity
			rows: 50,
			page: 1,
			output: "json",
		};

		const res = await axios.get(IA_BASE, { params });
		const docs = res.data.response.docs;

		// IA returns "Items" (Identifiers). Each Item has multiple files.
		// We need to fetch the file list for each item to find the actual video link.
		// However, to keep it fast, we will construct the direct download link
		// which is usually https://archive.org/download/{identifier}/{identifier}.mp4

		// For now, let's return the Items.
		// The frontend will select an Item, and we will fetch specific files then.
		return docs.map((doc) => ({
			id: doc.identifier,
			title: doc.title,
			year: doc.year,
			downloads: doc.downloads,
			// We construct a "Details" URL so we can verify files later if needed
			detailsUrl: `https://archive.org/details/${doc.identifier}`,
		}));
	} catch (err) {
		logger.error(`IA Search Error: ${err.toString()}`);
		return [];
	}
};

// Helper to get actual file links for a specific Item ID
export const getArchiveFiles = async (identifier) => {
	try {
		const res = await axios.get(`https://archive.org/metadata/${identifier}`);
		const files = res.data.files;
		const server = res.data.d1 || res.data.d2;
		const dir = res.data.dir;

		// Filter for video files
		return files
			.filter(
				(f) =>
					f.format === "MPEG4" ||
					f.format === "Matroska" ||
					f.format === "h.264" ||
					f.name.endsWith(".mp4") ||
					f.name.endsWith(".mkv"),
			)
			.map((f) => ({
				filename: f.name,
				size: f.size,
				format: f.format,
				// Construct Direct Download Link
				downloadUrl: `https://${server}${dir}/${f.name}`,
			}));
	} catch (err) {
		return [];
	}
};
