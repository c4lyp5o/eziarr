import { useState, useEffect } from "react";
import { Send, FileVideo } from "lucide-react";

import { useToast } from "../context/Toast";

const TelegramTab = ({ service, serviceId, query, mutate }) => {
	const { toast } = useToast();

	// Connection
	const [telegramConnected, setTelegramConnected] = useState(false);
	const [checkingTelegramAuth, setCheckingTelegramAuth] = useState(false);

	// Auth Flow
	const [telegramAuthState, setTelegramAuthState] = useState("PHONE"); // PHONE | CODE | PASSWORD
	const [telegramPhoneNumber, setTelegramPhoneNumber] = useState("");
	const [telegramCode, setTelegramCode] = useState("");
	const [telegramPassword, setTelegramPassword] = useState("");

	// Search Flow
	const [availableChannels, setAvailableChannels] = useState([]);
	const [selectedChannel, setSelectedChannel] = useState("");
	const [telegramSearchResults, setTelegramSearchResults] = useState([]);
	const [grabbingId, setGrabbingId] = useState(null);

	const [isLoading, setIsLoading] = useState(false);

	const handleCheckTelegramStatus = async () => {
		try {
			setCheckingTelegramAuth(true);
			const res = await fetch("/api/v1/telegram/status");
			const userDetails = await res.json();
			setTelegramConnected(userDetails.connected);
			if (userDetails.channels) {
				setAvailableChannels(userDetails.channels);
				if (!selectedChannel && userDetails.channels.length > 0) {
					setSelectedChannel(
						userDetails.channels[0].username
							? `@${userDetails.channels[0].username}`
							: userDetails.channels[0].title,
					);
				}
			}
		} catch (err) {
			console.error("Telegram Status Check Failed", err);
			toast.error("Telegram Status Check Failed");
			setAvailableChannels([]);
			setSelectedChannel("");
			setTelegramSearchResults([]);
			setGrabbingId(null);
			setTelegramConnected(false);
		} finally {
			setCheckingTelegramAuth(false);
		}
	};

	const handleSendCodeTelegram = async () => {
		try {
			await fetch("/api/v1/telegram/auth/send-code", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ phoneNumber: telegramPhoneNumber }),
			});
			toast.success("Telegram Code Sent");
			setTelegramAuthState("CODE");
		} catch (err) {
			console.error("Sending Telegram Code Failed", err);
			toast.error("Sending Telegram Code Failed");
		}
	};

	const handleLoginTelegram = async () => {
		try {
			const res = await fetch("/api/v1/telegram/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					code: telegramCode,
					password: telegramPassword,
				}),
			});
			const data = await res.json();

			if (data.success) {
				toast.success("Telegram Login Successful");
				setTelegramConnected(true);
				handleCheckTelegramStatus();
			} else if (data.error === "2FA_NEEDED") {
				toast.info("2FA Required For Telegram Login");
				setTelegramAuthState("PASSWORD");
			} else {
				toast.error("Telegram Login Failed");
			}
		} catch (err) {
			console.error("Telegram Login Failed", err);
			toast.error("Telegram Login Failed");
		}
	};

	const handleSearchFromTelegram = async () => {
		if (!selectedChannel) return toast.error("Please select a channel");

		try {
			setIsLoading(true);
			setTelegramSearchResults([]);
			const res = await fetch("/api/v1/telegram/search", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ channel: selectedChannel, query }),
			});
			const telegramFiles = await res.json();
			if (telegramFiles.length === 0) {
				toast.warning("No results found in Telegram");
				return;
			}
			toast.success(`Got ${telegramFiles.length} results from Telegram`);
			setTelegramSearchResults(telegramFiles);
		} catch (err) {
			console.error("Telegram Search Failed", err);
			toast.error("Telegram Search Failed");
			setTelegramSearchResults([]);
		} finally {
			setIsLoading(false);
		}
	};

	const handleGrabFromTelegram = async (msg) => {
		try {
			setGrabbingId(msg.id);
			const res = await fetch("/api/v1/telegram/import", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					service,
					serviceId,
					channel: selectedChannel,
					messageId: msg.id,
					filename: msg.filename,
				}),
			});
			const data = await res.json();
			if (data.success) {
        setTimeout(() => {
          mutate();
        }, 5000);
				toast.success("Grab From Telegram Started");
			} else {
				toast.error("Grab From Telegram Failed");
			}
		} catch (err) {
			console.error("Grab From Telegram Failed", err);
			toast.error("Grab From Telegram Failed");
		} finally {
			setGrabbingId(null);
		}
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: later
	useEffect(() => {
		handleCheckTelegramStatus();
	}, []);

	return (
		<div className="p-6">
			{checkingTelegramAuth ? (
				<div className="flex justify-center p-12">
					<div className="animate-spin w-8 h-8 border-2 border-blue-500 rounded-full border-t-transparent"></div>
				</div>
			) : !telegramConnected ? (
				// --- LOGIN FORM ---
				<div className="max-w-sm mx-auto bg-gray-900 p-8 rounded-xl border border-gray-800 text-center">
					<div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-400">
						<Send size={24} />
					</div>
					<h3 className="text-lg font-bold text-white mb-6">
						Connect Telegram
					</h3>

					{telegramAuthState === "PHONE" && (
						<div className="space-y-4">
							<input
								value={telegramPhoneNumber}
								onChange={(e) => setTelegramPhoneNumber(e.target.value)}
								placeholder="+1234567890"
								className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white text-center"
							/>
							<button
								type="button"
								onClick={handleSendCodeTelegram}
								className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg font-bold"
							>
								Send Code
							</button>
						</div>
					)}

					{telegramAuthState === "CODE" && (
						<div className="space-y-4">
							<input
								value={telegramCode}
								onChange={(e) => setTelegramCode(e.target.value)}
								placeholder="12345"
								className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white text-center tracking-widest text-lg"
							/>
							<button
								type="button"
								onClick={handleLoginTelegram}
								className="w-full bg-green-600 hover:bg-green-500 text-white py-2 rounded-lg font-bold"
							>
								Verify Code
							</button>
						</div>
					)}

					{telegramAuthState === "PASSWORD" && (
						<div className="space-y-4">
							<p className="text-sm text-yellow-400">2FA Password Required</p>
							<input
								type="password"
								value={telegramPassword}
								onChange={(e) => setTelegramPassword(e.target.value)}
								placeholder="Cloud Password"
								className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white text-center"
							/>
							<button
								type="button"
								onClick={handleLoginTelegram}
								className="w-full bg-purple-600 hover:bg-purple-500 text-white py-2 rounded-lg font-bold"
							>
								Unlock
							</button>
						</div>
					)}
				</div>
			) : (
				// --- CONNECTED: SEARCH UI ---
				<>
					<div className="flex gap-3 mb-6 bg-gray-900/50 p-4 rounded-xl border border-gray-800">
						<div className="flex-1">
							<label className="block text-xs font-bold text-gray-500 uppercase mb-1">
								Target Channel
								<div className="relative">
									<select
										value={selectedChannel}
										onChange={(e) => setSelectedChannel(e.target.value)}
										className="w-full bg-black border border-gray-700 rounded-lg py-2 pl-3 pr-8 text-white text-sm appearance-none focus:outline-none focus:border-blue-500 transition-all"
									>
										<option value="" disabled>
											Select a channel...
										</option>
										{availableChannels.map((c) => (
											// CHANGE: Use c.id as the value.
											// The backend sends 'id' as a string to avoid BigInt issues in JSON.
											<option key={c.id} value={c.id}>
												{c.title} - {c.username ? `(@${c.username})` : ""} -{" "}
												{c.id}
											</option>
										))}
									</select>
									{/* Dropdown Arrow Icon */}
									<div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-gray-500">
										<svg
											className="w-4 h-4"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
										>
											<title>Arrow Down</title>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth="2"
												d="M19 9l-7 7-7-7"
											></path>
										</svg>
									</div>
								</div>
							</label>
						</div>
						<div className="flex items-end">
							<button
								type="button"
								onClick={handleSearchFromTelegram}
								disabled={isLoading}
								className="h-9.5 px-6 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg text-sm flex items-center gap-2"
							>
								{isLoading ? (
									<div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
								) : (
									<Send size={16} />
								)}
								Search
							</button>
						</div>
					</div>

					<div className="space-y-3">
						{telegramSearchResults.length === 0 && !isLoading && (
							<div className="text-center py-12 text-gray-500 border-2 border-dashed border-gray-800 rounded-xl">
								<Send size={32} className="mx-auto mb-3 opacity-20" />
								<p>Search a channel to find media.</p>
							</div>
						)}

						{telegramSearchResults.map((msg) => (
							<div
								key={msg.id}
								className="flex items-center justify-between bg-gray-800/40 border border-gray-700/50 p-4 rounded-xl"
							>
								<div className="flex items-center gap-4 overflow-hidden">
									<div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0 text-blue-400">
										<FileVideo size={20} />
									</div>
									<div className="min-w-0">
										<h4 className="text-sm font-medium text-white truncate pr-4">
											{msg.filename}
										</h4>
										<div className="flex gap-3 text-xs text-gray-400 mt-1">
											<span>{formatSize(msg.size)}</span>
											<span>•</span>
											<span>
												{new Date(msg.date * 1000).toLocaleDateString()}
											</span>
										</div>
									</div>
								</div>

								<button
									type="button"
									onClick={() => handleGrabFromTelegram(msg)}
									disabled={grabbingId === msg.id}
									className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-xs font-bold disabled:opacity-50"
								>
									{grabbingId === msg.id ? "Grabbing..." : "Grab"}
								</button>
							</div>
						))}
					</div>
				</>
			)}
		</div>
	);
};

export default TelegramTab;
