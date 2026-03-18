import { searchInternetArchive, getInternetArchiveFiles } from "../ia";

export const IAService = {
	postIASearch: async ({ body: { query } }) => {
		const files = await searchInternetArchive(query);
		return { success: true, files };
	},

	getIAFiles: async ({ params: { identifier } }) => {
		const filesInside = await getInternetArchiveFiles(identifier);
		return { success: true, filesInside };
	},
};
