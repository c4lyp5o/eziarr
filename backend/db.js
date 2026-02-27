import { Database } from "bun:sqlite";

const db = new Database("media.sqlite");

const DEFAULT_SETTINGS = {
	syncEnabled: true, // Enable or disable the worker sync
	hunterEnabled: true, // Enable or disable the Prowlarr hunter
	syncInterval: 10, // Minutes between *Arr missing syncs
	hunterInterval: 15, // Minutes between automated Prowlarr searches
	telegramApiId: "", // Your my.telegram.org App ID
	telegramApiHash: "", // Your my.telegram.org App Hash
	pathMapDocker: "", // e.g., /app/downloads
	pathMapRemote: "", // e.g., C:\Imports
};

// Initialize Table
try {
	db.run(`
  CREATE TABLE IF NOT EXISTS missing_items (
    id TEXT PRIMARY KEY,
    service_id INTEGER,
    title TEXT,
    series_title TEXT,
    type TEXT,
    service TEXT,
    release_date TEXT,
    poster_url TEXT,
    last_searched_at INTEGER,
    status TEXT
  )
`);

	db.run(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )
`);
} catch (err) {
	console.error("DB Initialization Error", err);
	process.exit(1);
}

const initDefaultSettings = () => {
	const currentSettings = getAllSettings();
	let updated = false;

	for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
		if (currentSettings[key] === undefined) {
			setSetting(key, value);
			updated = true;
		}
	}

	if (updated) console.log("⚙️ Default settings initialized in DB.");
};

export const getAllIds = () => {
	// Returns an array of strings: ['radarr-10', 'sonarr-25', ...]
	const res = db.query("SELECT id FROM missing_items").all();
	return res.map((row) => row.id);
};

export const getItems = () => {
	return db
		.query("SELECT * FROM missing_items ORDER BY release_date DESC")
		.all();
};

export const upsertItem = (item) => {
	const query = db.query(`
    INSERT INTO missing_items (id, service_id, title, series_title, type, service, release_date, poster_url, status)
    VALUES ($id, $serviceId, $title, $seriesTitle, $type, $service, $releaseDate, $posterUrl, $status)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      poster_url = excluded.poster_url,
      release_date = excluded.release_date
  `);

	query.run({
		$id: item.id,
		$serviceId: item.serviceId,
		$title: item.title,
		$seriesTitle: item.seriesTitle || null,
		$type: item.type,
		$service: item.service,
		$releaseDate: item.releaseDate,
		$posterUrl: item.posterUrl,
		$status: item.status,
	});
};

export const deleteItem = (id) => {
	db.run("DELETE FROM missing_items WHERE id = ?", [id]);
};

export const markAsSearched = (id) => {
	db.run("UPDATE missing_items SET last_searched_at = ? WHERE id = ?", [
		Date.now(),
		id,
	]);
};

export const getNextItemToSearch = () => {
	// 86400000 ms = 24 hours
	const searchCutoff = Date.now() - 86400000;

	// Get current time in ISO format (YYYY-MM-DD...) to match string dates in DB
	const now = new Date().toISOString();

	return db
		.query(`
    SELECT * FROM missing_items 
    WHERE (last_searched_at IS NULL OR last_searched_at < $searchCutoff)
    AND release_date <= $now
    ORDER BY release_date DESC
    LIMIT 1
  `)
		.get({
			$searchCutoff: searchCutoff,
			$now: now,
		});
};

export const clearTable = () => {
	db.run("DELETE FROM missing_items");
};

export const getSetting = (key, defaultValue = null) => {
	const result = db
		.query("SELECT value FROM settings WHERE key = $key")
		.get({ $key: key });

	if (!result) return defaultValue;

	try {
		return JSON.parse(result.value);
	} catch (err) {
		console.warn(
			`⚠️ Failed to parse JSON for setting '${key}'. Using raw value. Error: ${err.toString()}`,
		);
		return result.value;
	}
};

export const setSetting = (key, value) => {
	// Store everything as a JSON string to preserve types (bool, number, object)
	const query = db.query(`
    INSERT INTO settings (key, value) VALUES ($key, $value)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);
	query.run({
		$key: key,
		$value: JSON.stringify(value),
	});
};

export const getAllSettings = () => {
	const rows = db.query("SELECT * FROM settings").all();
	// Convert rows [{key: "a", value: "1"}] -> Object { a: 1 }
	return rows.reduce((acc, row) => {
		try {
			acc[row.key] = JSON.parse(row.value);
		} catch (err) {
			console.warn(
				`⚠️ Failed to parse JSON for setting '${row.key}'. Using raw value. Error: ${err.toString()}`,
			);
			acc[row.key] = row.value;
		}
		return acc;
	}, {});
};

initDefaultSettings();
