export async function apiCall(
	path,
	{ method = "GET", body, headers, signal } = {},
) {
	const doFetch = async () => {
		const res = await fetch(path, {
			method,
			body: body ? JSON.stringify(body) : undefined,
			headers: {
				...(body ? { "Content-Type": "application/json" } : {}),
				...(headers || {}),
			},
			signal,
			credentials: "same-origin",
		});

		const ct = res.headers.get("content-type") || "";
		const data = ct.includes("application/json")
			? await res.json()
			: await res.text();

		return { res, data };
	};

	const isAuthEndpoint =
		path === "/api/v1/login" ||
		path === "/api/v1/refresh" ||
		path === "/api/v1/logout";

	let { res, data } = await doFetch();

	if (res.status === 401 && !isAuthEndpoint) {
		const refresh = await fetch("/api/v1/refresh", {
			method: "POST",
			credentials: "same-origin",
			signal,
		});

		if (refresh.ok) {
			({ res, data } = await doFetch());
		}
	}

	if (!res.ok) {
		const msg =
			typeof data === "string"
				? data
				: data?.error || data?.message || `HTTP ${res.status}`;
		throw new Error(msg);
	}

	return data;
}
