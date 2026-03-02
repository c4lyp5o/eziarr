import { useState, useEffect } from "react";
import { Send, FileVideo, Loader as SpinnerSmall } from "lucide-react";

import { useToast } from "../context/Toast";
import { apiCall } from "../utils/apiCall";
import { formatSize } from "../utils/formatSize";

import { Panel } from "./Panel";
import { Button } from "./Buttons";
import { ListItem } from "./ListItem";
import { ui } from "../ui/styles";

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
			const userDetails = await apiCall("/api/v1/telegram/status");
			setTelegramConnected(userDetails.connected);
			if (userDetails.channels) {
				setAvailableChannels(userDetails.channels);
				if (!selectedChannel && userDetails.channels.length > 0) {
					setSelectedChannel(userDetails.channels[0].id.toString());
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
			await apiCall("/api/v1/telegram/auth/send-code", {
				method: "POST",
				body: { phoneNumber: telegramPhoneNumber },
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
			const res = await apiCall("/api/v1/telegram/auth/login", {
				method: "POST",
				body: {
					code: telegramCode,
					password: telegramPassword,
				},
			});
			if (res.success) {
				toast.success("Telegram Login Successful");
				setTelegramConnected(true);
				handleCheckTelegramStatus();
			} else if (res.error === "2FA_NEEDED") {
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
			const telegramFiles = await apiCall("/api/v1/telegram/search", {
				method: "POST",
				body: { channel: selectedChannel, query },
			});
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
			const res = await apiCall("/api/v1/telegram/import", {
				method: "POST",
				body: {
					service,
					serviceId,
					channel: selectedChannel,
					messageId: msg.id,
					filename: msg.filename,
				},
			});
			if (res.success) {
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
				<div className="w-full mb-4 py-3 bg-blue-600/10 border border-blue-500/30 rounded-lg flex items-center justify-center gap-3 backdrop-blur-sm animate-pulse">
					<div className="w-4 h-4 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
					<span className="text-sm font-bold text-blue-400 tracking-wide">
						Connecting to Telegram...
					</span>
				</div>
			) : !telegramConnected ? (
				// --- LOGIN FORM ---
				<Panel className="max-w-sm mx-auto p-8 text-center">
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
								className={`${ui.input} text-center py-3`}
							/>
							<Button
								variant="primary"
								className="w-full"
								onClick={handleSendCodeTelegram}
							>
								Send Code
							</Button>
						</div>
					)}

					{telegramAuthState === "CODE" && (
						<div className="space-y-4">
							<input
								value={telegramCode}
								onChange={(e) => setTelegramCode(e.target.value)}
								placeholder="12345"
								className={`${ui.input} text-center py-3`}
							/>
							<Button
								variant="primary"
								className="w-full"
								onClick={handleLoginTelegram}
							>
								Verify Code
							</Button>
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
								className={`${ui.input} text-center py-3`}
							/>
							<Button
								variant="primary"
								className="w-full"
								onClick={handleLoginTelegram}
							>
								Unlock
							</Button>
						</div>
					)}
				</Panel>
			) : (
				// --- CONNECTED: SEARCH UI ---
				<>
					<Panel className="p-4 mb-6">
						{/** biome-ignore lint/a11y/noLabelWithoutControl: nop */}
						<label className="block text-xs font-bold text-gray-500 uppercase mb-2">
							Target Channel
						</label>
						<div className="flex gap-2 items-center">
							<div className="relative flex-1">
								<select
									value={selectedChannel}
									onChange={(e) => setSelectedChannel(e.target.value)}
									className={`${ui.input} appearance-none pr-8 focus:border-blue-500`}
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
							<Button
								variant="primary"
								onClick={handleSearchFromTelegram}
								disabled={isLoading}
							>
								{isLoading ? (
									<SpinnerSmall className="animate-spin" />
								) : (
									<Send size={16} />
								)}
								Search
							</Button>
						</div>
					</Panel>

					<div className="space-y-3">
						{telegramSearchResults.length === 0 && !isLoading && (
							<div className="text-center py-12 text-gray-500 border-2 border-dashed border-gray-800 rounded-xl">
								<Send size={32} className="mx-auto mb-3 opacity-20" />
								<p>Search a channel to find media.</p>
							</div>
						)}

						<div className="space-y-2">
							{telegramSearchResults.map((msg) => (
								<ListItem key={msg.id}>
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
									<Button
										variant="success"
										size="sm"
										onClick={() => handleGrabFromTelegram(msg)}
										disabled={grabbingId === msg.id}
									>
										{grabbingId === msg.id ? "Grabbing..." : "Grab"}
									</Button>
								</ListItem>
							))}
						</div>
					</div>
				</>
			)}
		</div>
	);
};

export default TelegramTab;
