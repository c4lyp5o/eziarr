const buckets = new Map();
const MAX_BUCKET_ENTRIES = 10000;

const getClientIp = (request) => {
	const xff = request.headers.get("x-forwarded-for");
	if (xff) return xff.split(",")[0].trim();
	return request.ip ?? "unknown";
};

// Exported so tests can start from a clean slate.
export const resetRateLimitBuckets = () => buckets.clear();

// Simple in-memory sliding-window rate limiter.
// Buckets live in this process only; a restart resets them.
// x-forwarded-for is trusted, so this must sit behind your reverse proxy,
// otherwise clients can spoof their way around it.
export const rateLimitHandler = ({ limit = 10, windowMs = 60000 } = {}) => {
	return ({ request, set }) => {
		const key = getClientIp(request);
		const now = Date.now();
		const windowStart = now - windowMs;

		const hits = (buckets.get(key) || []).filter((t) => t > windowStart);
		if (hits.length >= limit) {
			set.status = 429;
			return {
				success: false,
				message: "Too many requests. Try again later.",
			};
		}

		hits.push(now);
		buckets.set(key, hits);

		// Opportunistic cleanup so the map never grows unbounded
		if (buckets.size > MAX_BUCKET_ENTRIES) {
			for (const [k, times] of buckets) {
				if (times.every((t) => t <= windowStart)) buckets.delete(k);
			}
		}
	};
};
