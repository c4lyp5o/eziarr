import path from "node:path";
import { Database } from "bun:sqlite";
import { DEFAULT_SETTINGS } from "./config";
import { generalLogger as logger } from "./logger";

const db = new Database(path.join(import.meta.dir, "../db/eziarr.sqlite"));

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
	logger.error("[DB] ❌ Database Initialization Error: ", err);
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

	if (updated) logger.info("[DB] ⚙️ Default settings initialized in DB.");
};

export const getAllIds = () => {
	const res = db.query("SELECT id FROM missing_items").all();
	return res.map((row) => row.id);
};

export const getItems = () => {
	const fromDb = db
		.query("SELECT * FROM missing_items ORDER BY release_date ASC")
		.all();
	const missingItems = fromDb.map((row) => ({
		id: row.id,
		serviceId: row.service_id,
		title: row.title,
		seriesTitle: row.series_title,
		type: row.type,
		service: row.service,
		releaseDate: row.release_date,
		posterUrl: row.poster_url,
		status: row.status,
	}));

	return missingItems;
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
		logger.warn(
			`[DB] ⚠️ Failed to parse JSON for setting '${key}'. Using raw value. Error: `,
			err,
		);
		return result.value;
	}
};

export const setSetting = (key, value) => {
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
	return rows.reduce((acc, row) => {
		try {
			acc[row.key] = JSON.parse(row.value);
		} catch (err) {
			logger.warn(
				`[DB] ⚠️ Failed to parse JSON for setting '${row.key}'. Using raw value. Error: `,
				err,
			);
			acc[row.key] = row.value;
		}
		return acc;
	}, {});
};

export const getServicesConfig = () => {
	const s = getAllSettings();
	return {
		radarr: { url: s.radarrUrl, apiKey: s.radarrApiKey },
		sonarr: { url: s.sonarrUrl, apiKey: s.sonarrApiKey },
		lidarr: { url: s.lidarrUrl, apiKey: s.lidarrApiKey },
		prowlarr: { url: s.prowlarrUrl, apiKey: s.prowlarrApiKey },
	};
};

initDefaultSettings();
