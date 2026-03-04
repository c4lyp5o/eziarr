import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import { getSetting, setSetting } from "./db";
import { prepareFileDownload } from "./utils";
import { generalLogger as logger } from "./logger";

let tClient = null;

export const getTelegramClient = async () => {
	if (tClient) return tClient;

	const apiId = getSetting("telegramApiId");
	const apiHash = getSetting("telegramApiHash");
	if (!apiId || !apiHash) throw new Error("Missing API details.");

	const sessionString = getSetting("telegramSession", "");
	const session = new StringSession(sessionString);

	tClient = new TelegramClient(session, Number(apiId), apiHash, {
		connectionRetries: 5,
		useWSS: false,
	});

	await tClient.connect();
	return tClient;
};

export const sendLoginCode = async (phoneNumber) => {
	const client = await getTelegramClient();
	if (!client) throw new Error("Not connected.");

	const apiId = getSetting("telegramApiId");
	const apiHash = getSetting("telegramApiHash");
	if (!apiId || !apiHash) throw new Error("Missing API details.");

	const { phoneCodeHash } = await client.sendCode(
		{ apiId: Number(apiId), apiHash },
		phoneNumber,
	);

	setSetting("telegramTempHash", phoneCodeHash);
	setSetting("telegramTempPhoneNumber", phoneNumber);

	return { success: true };
};

export const completeLogin = async (code, password) => {
	const client = await getTelegramClient();
	if (!client) throw new Error("Not connected.");

	const apiId = getSetting("telegramApiId");
	const apiHash = getSetting("telegramApiHash");
	if (!apiId || !apiHash) throw new Error("Missing API details.");

	const phoneCodeHash = getSetting("telegramTempHash");
	const phoneNumber = getSetting("telegramTempPhoneNumber");
	if (!phoneCodeHash || !phoneNumber) throw new Error("Missing phone details.");

	try {
		await client.invoke(
			new Api.auth.SignIn({
				phoneNumber,
				phoneCodeHash,
				phoneCode: code,
			}),
		);

		const sessionStr = client.session.save();
		setSetting("telegramSession", sessionStr);
		return { success: true };
	} catch (err) {
		if (err.message?.includes("SESSION_PASSWORD_NEEDED")) {
			if (!password) return { success: false, message: "2FA_NEEDED" };

			await client.signInWithPassword({
				apiId: Number(apiId),
				apiHash: apiHash,
				password: password,
				phoneNumber: phoneNumber,
				phoneCode: code,
				phoneCodeHash: phoneCodeHash,
			});

			const sessionStr = client.session.save();
			setSetting("telegramSession", sessionStr);
			return { success: true };
		}
		logger.error("[TELEGRAM] Login error: ", err);
		throw new Error("Login Error");
	}
};

export const searchChannel = async (channelIdentifier, query) => {
	const client = await getTelegramClient();
	if (!client) throw new Error("Not connected.");

	if (!(await client.checkAuthorization())) throw new Error("Not authorized");

	try {
		const entity = await resolveEntity(client, channelIdentifier);

		logger.info(
			`[TELEGRAM] 🔍 Searching "${entity.title || channelIdentifier}" for "${query}"...`,
		);

		const result = await client.invoke(
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
		logger.error("[TELEGRAM] Search Error: ", err);
		throw new Error("Search Error");
	}
};

export const downloadMedia = async (channel, messageId, filename) => {
	const client = await getTelegramClient();
	if (!client) throw new Error("Not connected");

	if (!(await client.checkAuthorization())) throw new Error("Not authorized");

	const entity = await resolveEntity(client, channel);

	const messages = await client.getMessages(entity, { ids: [messageId] });
	const message = messages[0];
	if (!message?.media) throw new Error("No media");

	const { outputDir, outputPath } = prepareFileDownload(filename);

	logger.info(`[TELEGRAM] 📥 Starting download: ${filename}`);

	await client.downloadMedia(message.media, {
		outputFile: outputPath,
		workers: 4,
	});

	logger.info(`[TELEGRAM] ✅ Download complete: ${outputPath}`);
	return { success: true, path: outputDir, filePath: outputPath };
};

const resolveEntity = async (client, identifier) => {
	try {
		// 1. If it looks like an ID (e.g. "-100123456" or "123456")
		if (/^-?\d+$/.test(identifier)) {
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

		if (match?.entity) {
			return match.entity;
		} else {
			logger.error("[TELEGRAM] Channel Error: ", err);
			throw new Error("Channel Error");
		}
	}
};
