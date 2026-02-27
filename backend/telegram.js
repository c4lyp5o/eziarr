import fs from "node:fs";
import path from "node:path";
import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import { getSetting, setSetting } from "./db";

const isId = (str) => /^-?\d+$/.test(str);

const DOWNLOAD_DIR = path.resolve(process.cwd(), "downloads");
if (!fs.existsSync(DOWNLOAD_DIR))
	fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

let tClient = null;

const getCredentials = () => {
	const apiId = getSetting("telegramApiId");
	const apiHash = getSetting("telegramApiHash");

	if (!apiId || !apiHash) {
		return null;
	}

	return { apiId: Number(apiId), apiHash };
};

export const getTelegramClient = async () => {
	if (tClient) return tClient;

	const creds = getCredentials();
	if (!creds) {
		console.warn(
			"⚠️ Telegram API ID or Hash is missing. Please configure them in Settings.",
		);
		return null;
	}

	const sessionString = getSetting("telegram_session", "");
	const session = new StringSession(sessionString);

	tClient = new TelegramClient(session, creds.apiId, creds.apiHash, {
		connectionRetries: 5,
		useWSS: false,
	});

	try {
		await tClient.connect();
	} catch (err) {
		console.error("[TELEGRAM] Telegram connection failed", err);
	}

	return tClient;
};

export const sendLoginCode = async (phoneNumber) => {
	const tClient = await getTelegramClient();
	const creds = getCredentials();

	if (!tClient || !creds)
		throw new Error("API ID and Hash not configured in settings.");

	const { phoneCodeHash } = await tClient.sendCode(
		{ apiId: creds.apiId, apiHash: creds.apiHash },
		phoneNumber,
	);

	setSetting("telegram_temp_hash", phoneCodeHash);
	setSetting("telegram_temp_phone", phoneNumber);

	return { success: true };
};

export const completeLogin = async (code, password) => {
	const tClient = await getTelegramClient();
	const creds = getCredentials();

	if (!tClient || !creds)
		throw new Error("API ID and Hash not configured in settings.");

	const phoneCodeHash = getSetting("telegram_temp_hash");
	const phoneNumber = getSetting("telegram_temp_phone");

	try {
		await tClient.invoke(
			new Api.auth.SignIn({
				phoneNumber,
				phoneCodeHash,
				phoneCode: code,
			}),
		);

		const sessionStr = tClient.session.save();
		setSetting("telegram_session", sessionStr);

		return { success: true };
	} catch (error) {
		// If 2FA is needed
		if (error.message?.includes("SESSION_PASSWORD_NEEDED")) {
			if (!password) return { success: false, error: "2FA_NEEDED" };

			await tClient.signInWithPassword({
				apiId: creds.apiId,
				apiHash: creds.apiHash,
				password: password,
				phoneNumber: phoneNumber,
				phoneCode: code,
				phoneCodeHash: phoneCodeHash,
			});

			const sessionStr = tClient.session.save();
			setSetting("telegram_session", sessionStr);
			return { success: true };
		}
		return { success: false, error: error.message };
	}
};

const resolveEntity = async (client, identifier) => {
	try {
		// 1. If it looks like an ID (e.g. "-100123456" or "123456")
		if (isId(identifier)) {
			// We must cast to BigInt for GramJS to treat it as an ID
			// If it fails to find it, it throws, and we catch it below.
			return await client.getEntity(BigInt(identifier));
		}

		// 2. Try as username or generic identifier
		return await client.getEntity(identifier);
	} catch (err) {
		// 3. Fallback: Search Dialog Cache by Title
		// (Only runs if the ID lookup failed, which shouldn't happen if getDialogs() ran)
		const dialogs = await client.getDialogs({});
		const match = dialogs.find(
			(d) =>
				d.title === identifier ||
				d.title.toLowerCase().includes(identifier.toLowerCase()),
		);

		if (match?.entity) return match.entity;

		console.error(
			`[TELEEGRAM] Failed to resolve Telegram entity for identifier: "${identifier}"`,
			err,
		);
		throw new Error(`Could not find channel with identifier: "${identifier}"`);
	}
};

export const searchChannel = async (channelIdentifier, query) => {
	const tClient = await getTelegramClient();

	if (!(await tClient.checkAuthorization())) {
		console.error("[TELEGRAM] Telegram client not authorized");
		throw new Error("Not authorized");
	}

	try {
		const entity = await resolveEntity(tClient, channelIdentifier);

		console.log(
			`[TELEGRAM] 🔍 Searching "${entity.title || channelIdentifier}" for "${query}"...`,
		);

		const result = await tClient.invoke(
			new Api.messages.Search({
				peer: entity,
				q: query,
				filter: new Api.InputMessagesFilterEmpty(),
				minDate: 0,
				maxDate: 0,
				offsetId: 0,
				addOffset: 0,
				limit: 50,
				maxId: 0,
				minId: 0,
				hash: BigInt(0),
			}),
		);

		const msgs = result.messages || [];

		// console.log(
		// 	"Raw search results:",
		// 	msgs.map((m) => ({
		// 		id: m.id,
		// 		text: m.message,
		// 		media: m.media ? m.media.toJSON() : null,
		// 	})),
		// );

		return msgs
			.map((msg) => {
				const doc = msg.media?.document;
				if (!doc) return null;

				const filenameAttr = doc.attributes?.find(
					(a) => a.className === "DocumentAttributeFilename",
				);
				const filename = filenameAttr ? filenameAttr.fileName : "Unknown";

				return {
					id: msg.id,
					channel: channelIdentifier,
					filename: filename,
					size: Number(doc.size),
					date: msg.date,
					messageText: msg.message,
				};
			})
			.filter(Boolean);
	} catch (err) {
		console.error("[TELEGRAM] Telegram Search Error", err);
		throw new Error(`Failed to search Telegram channel. ${err.message}`);
	}
};

export const downloadMedia = async (channel, messageId, filename) => {
	const tClient = await getTelegramClient();
	if (!tClient) throw new Error("Telegram client not connected");

	if (!(await tClient.checkAuthorization())) throw new Error("Not authorized");

	const entity = await resolveEntity(tClient, channel);

	const messages = await tClient.getMessages(entity, { ids: [messageId] });
	const message = messages[0];
	if (!message?.media) throw new Error("No media");

	const safeFilename = filename.replace(/[^a-z0-9.]/gi, "_");
	const outputDir = path.join(DOWNLOAD_DIR, safeFilename.split(".")[0]);
	const outputPath = path.join(outputDir, safeFilename);

	if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

	console.log(`[TELEGRAM] 📥 Downloading ${filename}...`);
	await tClient.downloadMedia(message.media, {
		outputFile: outputPath,
		workers: 4,
	});

	console.log(`[TELEGRAM] ✅ Downloaded to dir: ${outputDir} and file: ${outputPath}`);
	return { path: outputDir, filePath: outputPath };
};
