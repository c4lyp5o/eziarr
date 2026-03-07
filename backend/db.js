import path from "node:path";
import { Database } from "bun:sqlite";
import { DEFAULT_SETTINGS, DB_DIR } from "./config";
import { generalLogger as logger } from "./logger";

const dbPath = path.join(DB_DIR, "eziarr.sqlite");

const db = new Database(dbPath, { create: true });

db.run("PRAGMA journal_mode = WAL;");
db.run("PRAGMA busy_timeout = 5000;");
db.run("PRAGMA foreign_keys = ON;");

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

	db.run(`
  CREATE TABLE IF NOT EXISTS active_tasks (
    id TEXT PRIMARY KEY,
    type TEXT,
    status TEXT,
    message TEXT,
    progress INTEGER,
    updated_at INTEGER
  )
`);

	db.run(`
  CREATE TABLE IF NOT EXISTS download_queue (
    id TEXT PRIMARY KEY,
    type TEXT,
    payload TEXT,
    status TEXT,
    created_at INTEGER,
    updated_at INTEGER,
    attempts INTEGER DEFAULT 0,
    last_error TEXT,
    next_attempt INTEGER,
    started_at INTEGER
  )
`);

	db.run(`
  CREATE TABLE IF NOT EXISTS download_history (
    id TEXT PRIMARY KEY,
    type TEXT,
    payload TEXT,
    service TEXT,
    service_id INTEGER,
    filename TEXT,
    source_url TEXT,
    channel TEXT,
    message_id INTEGER,
    status TEXT, -- 'completed' | 'failed'
    attempts INTEGER,
    last_error TEXT,
    result_file_path TEXT,
    result_output_dir TEXT,
    created_at INTEGER,
    started_at INTEGER,
    finished_at INTEGER,
    duration_ms INTEGER,
    download_bytes INTEGER
  )
`);

	db.run(
		"CREATE INDEX IF NOT EXISTS idx_dlh_finished_at ON download_history(finished_at DESC);",
	);
	db.run(
		"CREATE INDEX IF NOT EXISTS idx_dlh_service_finished_at ON download_history(service, finished_at DESC);",
	);
	db.run(
		"CREATE INDEX IF NOT EXISTS idx_dlh_status_finished_at ON download_history(status, finished_at DESC);",
	);

	logger.info("[DB] ✅ Database initialized.");
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

// missing media
export const getMissingMedia = () => {
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

export const upsertMissingMedia = (item) => {
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

export const unmonitorMissingMedia = (id) => {
	db.run("DELETE FROM missing_items WHERE id = ?", [id]);
};

export const markAsSearchedMissingMedia = (id) => {
	db.run("UPDATE missing_items SET last_searched_at = ? WHERE id = ?", [
		Date.now(),
		id,
	]);
};

export const getNextItemToSearchMissingMedia = () => {
	// 86400000 ms = 24 hours
	const searchCutoff = Date.now() - 86400000;

	const now = new Date().toISOString();

	const row = db
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

	if (!row) return null;
	return {
		id: row.id,
		serviceId: row.service_id,
		title: row.title,
		seriesTitle: row.series_title,
		type: row.type,
		service: row.service,
		releaseDate: row.release_date,
		posterUrl: row.poster_url,
		lastSearchedAt: row.last_searched_at,
		status: row.status,
	};
};

export const clearMissingMedia = () => {
	db.run("DELETE FROM missing_items");
};

// settings
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

export const getAllServices = () => {
	const s = getAllSettings();
	return {
		radarr: { url: s.radarrUrl, apiKey: s.radarrApiKey },
		sonarr: { url: s.sonarrUrl, apiKey: s.sonarrApiKey },
		lidarr: { url: s.lidarrUrl, apiKey: s.lidarrApiKey },
		prowlarr: { url: s.prowlarrUrl, apiKey: s.prowlarrApiKey },
	};
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

// tasks
export const getTasks = () => {
	return db
		.query(
			"SELECT * FROM active_tasks WHERE status = 'running' ORDER BY updated_at DESC",
		)
		.all();
};

export const upsertTask = (id, type, status, message, progress = 0) => {
	db.query(`
    INSERT INTO active_tasks (id, type, status, message, progress, updated_at)
    VALUES ($id, $type, $status, $message, $progress, $updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      message = excluded.message,
      progress = excluded.progress,
      updated_at = excluded.updated_at
  `).run({
		$id: id,
		$type: type,
		$status: status,
		$message: message,
		$progress: progress,
		$updatedAt: Date.now(),
	});
};

export const removeTask = (id) => {
	db.query("DELETE FROM active_tasks WHERE id = $id").run({ $id: id });
};

export const markStaleTasks = () => {
	db.query(`
    UPDATE active_tasks
    SET status = 'stale',
        message = 'Task was running when worker restarted',
        updated_at = $now
    WHERE status = 'running'
  `).run({ $now: Date.now() });
};

// download queue
export const getDownloadQueue = () => {
	return db
		.query(
			`
      SELECT *
      FROM download_queue
      ORDER BY
        CASE status
          WHEN 'downloading' THEN 0
          WHEN 'retry' THEN 1
          WHEN 'pending' THEN 2
          ELSE 3
        END,
        COALESCE(next_attempt, created_at) ASC
    `,
		)
		.all();
};

export const addToDownloadQueue = (type, payload) => {
	const now = Date.now();
	const id = `job-${now}-${Math.floor(Math.random() * 1000)}`;
	db.query(`
    INSERT INTO download_queue (id, type, payload, status, created_at, updated_at, attempts, next_attempt, started_at)
    VALUES ($id, $type, $payload, 'pending', $createdAt, $updatedAt, 0, $nextAttempt, NULL)
  `).run({
		$id: id,
		$type: type,
		$payload: JSON.stringify(payload),
		$createdAt: now,
		$updatedAt: now,
		$nextAttempt: now,
	});

	return id;
};

export const claimNextDownloadQueue = () => {
	const now = Date.now();

	const row = db
		.query(
			`
      SELECT id FROM download_queue
      WHERE (status = 'pending' OR status = 'retry')
        AND (next_attempt IS NULL OR next_attempt <= $now)
      ORDER BY COALESCE(next_attempt, created_at) ASC, created_at ASC
      LIMIT 1
    `,
		)
		.get({ $now: now });

	if (!row?.id) return null;

	const res = db
		.query(
			`
      UPDATE download_queue
      SET status = 'downloading',
          updated_at = $now,
          started_at = COALESCE(started_at, $now)
      WHERE id = $id
        AND (status = 'pending' OR status = 'retry')
    `,
		)
		.run({ $id: row.id, $now: now });

	if (res.changes !== 1) return null;

	return db
		.query("SELECT * FROM download_queue WHERE id = $id")
		.get({ $id: row.id });
};

export const markAsFailedDownloadQueue = (id, errMessage) => {
	db.query(`
    UPDATE download_queue
    SET status = 'failed',
        last_error = $lastError,
        updated_at = $now,
        next_attempt = NULL
    WHERE id = $id
  `).run({
		$id: id,
		$lastError: errMessage
			? String(errMessage).slice(0, 2000)
			: "Unknown error",
		$now: Date.now(),
	});
};

export const finalizeDownloadQueue = (id, finalStatus, result = {}) => {
	const q = db
		.query("SELECT * FROM download_queue WHERE id = $id")
		.get({ $id: id });
	if (!q) return;

	let payloadObj = null;
	try {
		payloadObj = JSON.parse(q.payload);
	} catch {
		payloadObj = null;
	}

	const finishedAt = Date.now();
	const attempts = Number(q.attempts ?? 0);
	const startedAt = q.started_at ?? null;

	const service = payloadObj?.service ?? null;
	const serviceId = payloadObj?.serviceId ?? null;
	const filename = payloadObj?.filename ?? null;

	// Only present for http jobs
	const sourceUrl = payloadObj?.url ?? null;

	// Only present for telegram jobs
	const channel = payloadObj?.channel ?? null;
	const messageId = payloadObj?.messageId ?? null;

	const durationMs =
		typeof startedAt === "number" ? Math.max(0, finishedAt - startedAt) : null;

	db.query(`
    INSERT INTO download_history (
      id, type, payload, status, attempts, last_error,
      result_file_path, result_output_dir,
      created_at, started_at, finished_at,
      duration_ms,
      service, service_id, filename, source_url, channel, message_id,
      download_bytes
    )
    VALUES (
      $id, $type, $payload, $status, $attempts, $lastError,
      $resultFilePath, $resultOutputDir,
      $createdAt, $startedAt, $finishedAt,
      $durationMs,
      $service, $serviceId, $filename, $sourceUrl, $channel, $messageId,
      $downloadBytes
    )
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      attempts = excluded.attempts,
      last_error = excluded.last_error,
      result_file_path = excluded.result_file_path,
      result_output_dir = excluded.result_output_dir,
      started_at = excluded.started_at,
      finished_at = excluded.finished_at,
      duration_ms = excluded.duration_ms,
      service = excluded.service,
      service_id = excluded.service_id,
      filename = excluded.filename,
      source_url = excluded.source_url,
      channel = excluded.channel,
      message_id = excluded.message_id,
      download_bytes = excluded.download_bytes
  `).run({
		$id: q.id,
		$type: q.type,
		$payload: q.payload,
		$status: finalStatus,
		$attempts: attempts,
		$lastError: q.last_error ?? null,
		$resultFilePath: result.filePath ?? null,
		$resultOutputDir: result.path ?? null,
		$createdAt: q.created_at ?? null,
		$startedAt: startedAt,
		$finishedAt: finishedAt,
		$durationMs: durationMs,
		$service: service,
		$serviceId: serviceId,
		$filename: filename,
		$sourceUrl: sourceUrl,
		$channel: channel,
		$messageId: messageId,
		$downloadBytes: result.downloadBytes ?? null,
	});

	db.query("DELETE FROM download_queue WHERE id = $id").run({ $id: id });
};

export const scheduleRetryDownloadQueue = (id, errMessage) => {
	const row = db
		.query("SELECT attempts FROM download_queue WHERE id = $id")
		.get({ $id: id });

	const attempts = Number(row?.attempts ?? 0) + 1;

	const delayMs = Math.min(
		30 * 60_000,
		60_000 * 2 ** Math.min(attempts - 1, 10),
	);
	const nextAttempt = Date.now() + delayMs;

	db.query(
		`
    UPDATE download_queue
    SET status = 'retry',
        attempts = $attempts,
        last_error = $lastError,
        updated_at = $updatedAt,
        next_attempt = $nextAttempt
    WHERE id = $id
  `,
	).run({
		$attempts: attempts,
		$lastError: errMessage
			? String(errMessage).slice(0, 2000)
			: "Unknown error",
		$updatedAt: Date.now(),
		$nextAttempt: nextAttempt,
		$id: id,
	});
};

export const unstuckDownloadQueue = (staleMs = 30 * 60_000) => {
	const cutoff = Date.now() - staleMs;
	db.query(`
    UPDATE download_queue
    SET status = 'retry',
        updated_at = $now,
        next_attempt = $now,
        last_error = COALESCE(last_error, 'Recovered after restart')
    WHERE status = 'downloading'
      AND (updated_at IS NULL OR updated_at < $cutoff)
  `).run({ $now: Date.now(), $cutoff: cutoff });
};

export const pruneDownloadQueue = (maxAgeMs = 3 * 24 * 60 * 60 * 1000) => {
	const cutoff = Date.now() - maxAgeMs;

	// Keep pending/retry/downloading jobs; clean only terminal states
	db.query(
		`
    DELETE FROM download_queue
    WHERE (status = 'failed' OR status = 'completed')
      AND (updated_at IS NOT NULL AND updated_at < $cutoff)
  `,
	).run({ $cutoff: cutoff });
};

// download history
export const getDownloadHistory = (
	limit = 100,
	status = null,
	finishedBefore = null,
) => {
	const lim = Math.min(500, Math.max(1, Number(limit || 100)));
	const fb = finishedBefore ? Number(finishedBefore) : null;

	if (status && fb) {
		return db
			.query(`
      SELECT * FROM download_history
      WHERE status = $status AND finished_at < $finishedBefore
      ORDER BY finished_at DESC
      LIMIT $limit
    `)
			.all({ $status: status, $finishedBefore: fb, $limit: lim });
	}

	if (status) {
		return db
			.query(`
      SELECT * FROM download_history
      WHERE status = $status
      ORDER BY finished_at DESC
      LIMIT $limit
    `)
			.all({ $status: status, $limit: lim });
	}

	if (fb) {
		return db
			.query(`
      SELECT * FROM download_history
      WHERE finished_at < $finishedBefore
      ORDER BY finished_at DESC
      LIMIT $limit
    `)
			.all({ $finishedBefore: fb, $limit: lim });
	}

	return db
		.query(`
    SELECT * FROM download_history
    ORDER BY finished_at DESC
    LIMIT $limit
  `)
		.all({ $limit: lim });
};

export const recordForceGrabHistory = (
	service,
	serviceId,
	title,
	downloadUrl,
	success,
	errorMsg = null,
) => {
	const id = `grab-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
	const now = Date.now();

	db.query(`
    INSERT INTO download_history (
      id, type, payload, status, attempts, last_error,
      created_at, started_at, finished_at,
      service, service_id, filename, source_url
    ) VALUES (
      $id, 'forcegrab', $payload, $status, 1, $lastError,
      $now, $now, $now,
      $service, $serviceId, $filename, $sourceUrl
    )
  `).run({
		$id: id,
		$payload: JSON.stringify({ title, downloadUrl }),
		$status: success ? "completed" : "failed",
		$lastError: errorMsg ? String(errorMsg).slice(0, 2000) : null,
		$now: now,
		$service: service,
		$serviceId: serviceId,
		$filename: title,
		$sourceUrl: downloadUrl,
	});
};

export const pruneDownloadHistory = (maxAgeMs = 3 * 24 * 60 * 60 * 1000) => {
	const cutoff = Date.now() - maxAgeMs;
	db.query(
		`
    DELETE FROM download_history
    WHERE finished_at IS NOT NULL AND finished_at < $cutoff
  `,
	).run({ $cutoff: cutoff });
};

// download stats
export const getDownloadStats = () => {
	return db
		.query(`
    SELECT
      service,
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
      SUM(COALESCE(download_bytes, 0)) AS bytes,
      AVG(CASE WHEN duration_ms IS NOT NULL THEN duration_ms END) AS avg_duration_ms
    FROM download_history
    GROUP BY service
    ORDER BY completed DESC
  `)
		.all();
};

initDefaultSettings();
