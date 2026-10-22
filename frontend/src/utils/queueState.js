// What the queue says about this title, in the trade's words.
export const describeQueue = (queueItem) => {
	if (!queueItem) return null;
	const status = String(queueItem.status || "").toLowerCase();
	const troubled =
		["warning", "error", "failed"].includes(status) ||
		["warning", "error"].includes(String(queueItem.trackStatus).toLowerCase());
	if (troubled) return { tone: "warning", label: "Stalled" };
	if (["pending", "queued", "delay"].includes(status))
		return { tone: "neutral", label: "Queued" };
	if (status === "retry") return { tone: "warning", label: "Retrying" };
	if (status === "paused") return { tone: "neutral", label: "Paused" };
	return { tone: "positive", label: "Downloading" };
};
