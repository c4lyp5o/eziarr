import { getClientIp } from "../utils";

const buckets = new Map();
const MAX_BUCKET_ENTRIES = 10000;

// Exported so tests can start from a clean slate.
export const resetRateLimitBuckets = () => buckets.clear();

// Simple in-memory sliding-window rate limiter.
// Buckets live in this process only; a restart resets them.
// Client IP comes from getClientIp(): X-Forwarded-For is only trusted when
// the direct peer is a reverse proxy (private/loopback), otherwise the real
// socket peer is used so the limiter can't be spoofed or globally collapsed.
export const rateLimitHandler = ({ limit = 10, windowMs = 60000 } = {}) => {
	return ({ request, set, server }) => {
		const key = getClientIp(request, server);
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
