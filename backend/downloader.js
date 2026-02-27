import axios from "axios";
import fs from "node:fs";
import path from "node:path";
import { generalLogger as logger } from "./logger";

const DOWNLOAD_DIR = path.resolve(process.cwd(), "downloads");
if (!fs.existsSync(DOWNLOAD_DIR))
	fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

export const downloadHttpFile = async (url, filename) => {
	const safeFilename = filename.replace(/[^a-z0-9.\-_]/gi, "_");

	const folderName =
		safeFilename.split(".").slice(0, -1).join(".") || "Unknown";
	const outputDir = path.join(DOWNLOAD_DIR, folderName);
	const outputPath = path.join(outputDir, safeFilename);

	if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

	logger.info(`[DOWNLOADER] 📥 Starting HTTP Download: ${url}`);

	const response = await axios({
		url,
		method: "GET",
		responseType: "stream",
		timeout: 30000,
	});

	const writer = fs.createWriteStream(outputPath);

	return new Promise((resolve, reject) => {
		response.data.pipe(writer);

		let error = null;

		writer.on("error", (err) => {
			error = err;
			writer.close();
			reject(err);
		});

		writer.on("close", () => {
			if (!error) {
				logger.info(`[DOWNLOADER] ✅ Download Complete: ${outputPath}`);
				resolve({ path: outputDir, filePath: outputPath });
			}
		});
	});
};
