import { scanOpenDir } from "../opendir";

export const OpendirService = {
	postOpendirScan: async ({ body: { url } }) => {
		const files = await scanOpenDir(url);
		return { success: true, files };
	},
};
