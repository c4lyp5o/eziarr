export const formatDuration = (ms) => {
	if (!ms) return "N/A";
	const mins = Math.floor(ms / 60000);
	const secs = ((ms % 60000) / 1000).toFixed(0);
	return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
};
