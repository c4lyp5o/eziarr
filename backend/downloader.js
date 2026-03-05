import axios from "axios";
import fs from "node:fs";
import { MAX_DOWNLOAD_BYTES } from "./config";
import { isSafeUrl, prepareFileDownload } from "./utils";
import { generalLogger as logger } from "./logger";

export const downloadHttpFile = async (url, filename, onProgress) => {
	if (!(await isSafeUrl(url)))
		throw new Error("Invalid or unsafe URL provided.");

	const { outputDir, outputPath } = await prepareFileDownload(filename);

	logger.info(`[DOWNLOADER] 📥 Starting Download: ${url}`);

	const response = await axios({
		url,
		method: "GET",
		responseType: "stream",
		timeout: 30000,
		maxRedirects: 0,
		validateStatus: (status) => status >= 200 && status < 300,
	});

	const contentLengthHeader = response.headers?.["content-length"];
	if (contentLengthHeader) {
		const contentLength = Number(contentLengthHeader);
		if (Number.isFinite(contentLength) && contentLength > MAX_DOWNLOAD_BYTES) {
			throw new Error(
				`Remote file is too large (${contentLength} bytes > ${MAX_DOWNLOAD_BYTES} bytes)`,
			);
		}
	}

	const totalLength = parseInt(response.headers["content-length"], 10);
	let downloadedBytes = 0;

	const writer = fs.createWriteStream(outputPath);

	return new Promise((resolve, reject) => {
		let error = null;

		response.data.on("data", (chunk) => {
			downloadedBytes += chunk.length;
			if (onProgress && totalLength) {
				const percent = Math.round((downloadedBytes / totalLength) * 100);
				onProgress(percent);
			}
			if (downloadedBytes > MAX_DOWNLOAD_BYTES) {
				error = new Error(
					`Download exceeded maximum size (${MAX_DOWNLOAD_BYTES} bytes)`,
				);
				response.data.destroy(error);
				writer.destroy(error);
			}
		});

		response.data.on("error", (err) => {
			error = err;
			writer.destroy(err);
			reject(err);
		});

		response.data.pipe(writer);

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
