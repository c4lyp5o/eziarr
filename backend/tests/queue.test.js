import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import { DB_DIR } from "../config.js";
import {
	addToDownloadQueue,
	claimNextDownloadQueue,
	scheduleRetryDownloadQueue,
	finalizeDownloadQueue,
	getDownloadQueue,
	getDownloadHistory,
} from "../db.js";
import { Database } from "bun:sqlite";

describe("SQLite Queue State Machine", () => {
	beforeEach(() => {
		const dbPath = path.join(DB_DIR, "eziarr.sqlite");
		const db = new Database(dbPath);

		db.run("DELETE FROM download_queue");
		db.run("DELETE FROM download_history");
		db.close();
	});

	it("Should add a job to the queue as 'pending'", () => {
		const jobId = addToDownloadQueue("http", { filename: "test.mkv" });
		const queue = getDownloadQueue();

		expect(queue.length).toBe(1);
		expect(queue[0].id).toBe(jobId);
		expect(queue[0].status).toBe("pending");
		expect(queue[0].attempts).toBe(0);
	});

	it("Should claim the oldest 'pending' job and mark as 'downloading'", () => {
		addToDownloadQueue("http", { filename: "test.mkv" });

		const claimedJob = claimNextDownloadQueue();
		expect(claimedJob).not.toBeNull();
		expect(claimedJob.status).toBe("downloading");

		const secondClaim = claimNextDownloadQueue();
		expect(secondClaim).toBeNull();
	});

	it("Should schedule a retry and increment attempts", () => {
		const jobId = addToDownloadQueue("http", { filename: "test.mkv" });
		claimNextDownloadQueue();

		scheduleRetryDownloadQueue(jobId, "Connection Timeout");

		const queue = getDownloadQueue();
		expect(queue[0].status).toBe("retry");
		expect(queue[0].attempts).toBe(1);
		expect(queue[0].last_error).toBe("Connection Timeout");
		expect(queue[0].next_attempt).toBeGreaterThan(Date.now());
	});

	it("Should finalize a job, remove it from queue, and add to history", () => {
		const jobId = addToDownloadQueue("http", {
			filename: "test.mkv",
			service: "radarr",
		});
		claimNextDownloadQueue();

		finalizeDownloadQueue(jobId, "completed", { downloadBytes: 1048576 });

		const queue = getDownloadQueue();
		const history = getDownloadHistory(10);

		expect(queue.length).toBe(0);
		expect(history.length).toBe(1);
		expect(history[0].id).toBe(jobId);
		expect(history[0].status).toBe("completed");
		expect(history[0].download_bytes).toBe(1048576);
	});
});
