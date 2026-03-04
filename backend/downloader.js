import axios from "axios";
import fs from "node:fs";
import { isSafeUrl, prepareFileDownload } from "./utils";
import { generalLogger as logger } from "./logger";

export const downloadHttpFile = async (url, filename) => {
	if (!(await isSafeUrl(url)))
		throw new Error("Invalid or unsafe URL provided.");

	const { outputDir, outputPath } = await prepareFileDownload(filename);

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
