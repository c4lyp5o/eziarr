export async function apiCall(
	path,
	{ method = "GET", body, headers, signal } = {},
) {
	const res = await fetch(path, {
		method,
		body: body ? JSON.stringify(body) : undefined,
		headers: {
			...(body ? { "Content-Type": "application/json" } : {}),
			...headers,
		},
		signal,
	});

	let data = null;
	const ct = res.headers.get("content-type") || "";
	if (ct.includes("application/json")) data = await res.json();
	else data = await res.text();

	if (!res.ok) {
		const msg =
			typeof data === "string"
				? data
				: data?.error || data?.message || `HTTP ${res.status}`;
		throw new Error(msg);
	}

	return data;
}
