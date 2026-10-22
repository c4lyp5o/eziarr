import crypto from "node:crypto";
import fs from "node:fs";
import { getSetting, setSetting } from "./db";
import { generalLogger as logger } from "./logger";

// First-boot setup. Until a password exists, POST /firsttime would let
// whoever reaches the server first claim it. So setup needs a one-time code
// that only the person with the server's console can read: it is minted at
// boot, printed to stdout (`docker logs eziarr`), never written to the log
// file or the database, works once, and changes on every restart until
// setup is done. Setting EZIARR_PASSWORD (or EZIARR_PASSWORD_FILE) skips it.

// No look-alikes (0/O, 1/I/L), so a code read off a terminal types cleanly.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const MIN_PASSWORD_LENGTH = 8;

let setupCode = null;

export const isFirstTime = () => {
	const v = getSetting("isFirstTime");
	return v === null || v === true || v === "true";
};

/** Mint a fresh code (8 chars, ~39 bits) shown as XXXX-XXXX. */
export const issueSetupCode = () => {
	let raw = "";
	for (let i = 0; i < 8; i++) raw += ALPHABET[crypto.randomInt(ALPHABET.length)];
	setupCode = `${raw.slice(0, 4)}-${raw.slice(4)}`;
	return setupCode;
};

// Forgiving of case, spaces and the display hyphen.
const normalize = (s) =>
	String(s ?? "")
		.replace(/[-\s]/g, "")
		.toUpperCase();

/** True when `input` is the current code. Constant-time compare. */
export const checkSetupCode = (input) => {
	if (!setupCode) return false;
	const got = Buffer.from(normalize(input));
	const want = Buffer.from(normalize(setupCode));
	return got.length === want.length && crypto.timingSafeEqual(got, want);
};

/** The code works once. */
export const consumeSetupCode = () => {
	setupCode = null;
};

export const completeSetup = async (password) => {
	setSetting("password", await Bun.password.hash(password));
	setSetting("isFirstTime", "false");
	consumeSetupCode();
};

const passwordFromEnv = () => {
	const file = process.env.EZIARR_PASSWORD_FILE;
	if (file) return fs.readFileSync(file, "utf-8").replace(/[\r\n]+$/, "");
	return process.env.EZIARR_PASSWORD || "";
};

const banner = (code) => {
	const url = `http://<this-host>:${process.env.PORT || 5000}`;
	const lines = [
		"First start: set the Eziarr password",
		"",
		`open        ${url}`,
		`setup code  ${code}`,
		"",
		"The code works once and changes on every restart until setup is done.",
		"To skip setup, set EZIARR_PASSWORD (or EZIARR_PASSWORD_FILE) and restart.",
	];
	const width = Math.max(...lines.map((l) => l.length));
	const bar = "─".repeat(width + 2);
	return [
		"",
		`┌${bar}┐`,
		...lines.map((l) => `│ ${l.padEnd(width)} │`),
		`└${bar}┘`,
		"",
	].join("\n");
};

/**
 * Runs once per boot. With a password already set it does nothing (an env
 * password never overwrites one). On first boot an env password completes
 * setup directly; otherwise it mints the code and prints the banner.
 */
export const prepareSetup = async () => {
	if (!isFirstTime()) return null;

	const envPassword = passwordFromEnv();
	if (envPassword) {
		if (envPassword.length < MIN_PASSWORD_LENGTH) {
			throw new Error(
				`EZIARR_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters`,
			);
		}
		await completeSetup(envPassword);
		logger.info("[SETUP] Password set from environment; setup complete.");
		return null;
	}

	const code = issueSetupCode();
	// stdout only: the code must not land in logs/general.log.
	console.log(banner(code));
	return code;
};
