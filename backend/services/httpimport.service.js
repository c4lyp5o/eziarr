import { getAllServices, addToDownloadQueue } from "../db";
import { coerceNumericId } from "../utils";
import { generalLogger as logger } from "../logger";
import { buildImportFilename } from "../import";

export const HTTPImportService = {
	postHTTPImport: async ({ body: { service, serviceId, url, filename } }) => {
		const SERVICES = getAllServices();
		const config = SERVICES[service];

		if (!config) return { success: false, message: "Invalid service" };

		if (!config.url || !config.apiKey) {
			logger.warn(`[SERVER] ${service} is not configured.`);
			return {
				success: false,
				message: `${service} is not configured.`,
			};
		}

		const sid = coerceNumericId(serviceId, "serviceId");

		const perfectName = await buildImportFilename({
			config,
			service,
			sid,
			filename,
		});

		logger.info(`[SERVER] 📥 Queueing HTTP download: ${perfectName}`);

		addToDownloadQueue("http", {
			service,
			serviceId: sid,
			url,
			filename: perfectName,
		});

		return {
			success: true,
			message: `Added to download queue! Check Active Tasks.`,
		};
	},
};
