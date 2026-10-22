import { useState, useEffect } from "react";
import { Send, FileVideo, Loader as SpinnerSmall } from "lucide-react";

import { useToast } from "../context/Toast";
import { apiCall } from "../utils/apiCall";
import { formatSize } from "../utils/formatSize";

import { Panel } from "./Panel";
import { Button } from "./Buttons";
import { ListItem } from "./ListItem";
import { ui } from "../ui/styles";

// The server's match score (backend/match.js): about 1 means the title is in
// the file name; below WEAK the name barely resembles it.
const STRONG = 0.9;
const WEAK = 0.5;

const TelegramTab = ({ status, service, serviceId, query, mutate }) => {
	const { toast } = useToast();

	// Connection
	const [telegramConnected, setTelegramConnected] = useState(false);
	const [checkingTelegramAuth, setCheckingTelegramAuth] = useState(!!status);

	// Auth Flow
	const [telegramAuthState, setTelegramAuthState] = useState("PHONE"); // PHONE | CODE | PASSWORD
	const [telegramPhoneNumber, setTelegramPhoneNumber] = useState("");
	const [telegramCode, setTelegramCode] = useState("");
	const [telegramPassword, setTelegramPassword] = useState("");

	// Search Flow
	const [telegramSearchResults, setTelegramSearchResults] = useState([]);
	// Filled in with the title; editable, because channels name files their
	// own way and only a person knows to try "5cm" for "5 cm".
	const [searchText, setSearchText] = useState(query ?? "");
	const [grabbingId, setGrabbingId] = useState(null);

	const [isLoading, setIsLoading] = useState(false);
	const [isWaitingCode, setIsWaitingCode] = useState(false);
	const [isWaitingLogin, setIsWaitingLogin] = useState(false);

	const handleCheckTelegramStatus = async () => {
		try {
			setCheckingTelegramAuth(true);
			const userDetails = await apiCall("/api/v1/telegram/status");
			setTelegramConnected(userDetails.connected);
		} catch {
			toast.error("Telegram Status Check Failed");
			setTelegramSearchResults([]);
			setGrabbingId(null);
			setTelegramConnected(false);
		} finally {
			setCheckingTelegramAuth(false);
		}
	};

	const handleSendCodeTelegram = async () => {
		try {
			setIsWaitingCode(true);
			await apiCall("/api/v1/telegram/auth/send-code", {
				method: "POST",
				body: { phoneNumber: telegramPhoneNumber },
			});
			toast.success("Telegram Code Sent");
			setTelegramAuthState("CODE");
		} catch {
			toast.error("Sending Telegram Code Failed");
		} finally {
			setIsWaitingCode(false);
		}
	};

	const handleLoginTelegram = async () => {
		try {
			setIsWaitingLogin(true);
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
			} else if (res.message === "2FA_NEEDED") {
				setIsWaitingLogin(false);
				toast.info("2FA Required For Telegram Login");
				setTelegramAuthState("PASSWORD");
			} else {
				toast.error("Telegram Login Failed");
			}
		} catch {
			toast.error("Telegram Login Failed");
		} finally {
			setIsWaitingLogin(false);
		}
	};

	const handleSearchFromTelegram = async () => {
		try {
			setIsLoading(true);
			setTelegramSearchResults([]);
			const { files } = await apiCall("/api/v1/telegram/search", {
				method: "POST",
				body: {
					query: searchText.trim() || query,
					service,
					serviceId,
				},
			});
			if (files.length === 0) {
				toast.warning("No results found in Telegram");
				return;
			}
			toast.success(`Got ${files.length} results from Telegram`);
			setTelegramSearchResults(files);
		} catch {
			toast.error("Telegram Search Failed");
			setTelegramSearchResults([]);
		} finally {
			setIsLoading(false);
		}
	};

	const handleGrabFromTelegram = async (msg) => {
		try {
			setGrabbingId(`${msg.channel}:${msg.id}`);
			const res = await apiCall("/api/v1/telegram/import", {
				method: "POST",
				body: {
					service,
					serviceId,
					channel: msg.channel,
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
				toast.error(res.message);
			}
		} catch {
			toast.error("Grab From Telegram Failed");
		} finally {
			setGrabbingId(null);
		}
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: later
	useEffect(() => {
		if (status) handleCheckTelegramStatus();
	}, []);

	if (!status)
		return (
			<div className="p-6">
				<div className="w-full mb-4 py-3 bg-neg-bg border border-negative/30 rounded-lg flex items-center justify-center gap-3">
					<span className="text-sm font-semibold text-negative">
						Telegram is not configured!
					</span>
				</div>
			</div>
		);

	return (
		<div className="p-6">
			{checkingTelegramAuth ? (
				<div className="w-full mb-4 py-3 bg-raised border border-control rounded-lg flex items-center justify-center gap-3">
					<div className="w-4 h-4 border-2 border-control border-t-ink rounded-full animate-spin" />
					<span className="text-sm font-semibold text-ink">
						Connecting to Telegram...
					</span>
				</div>
			) : !telegramConnected ? (
				// --- LOGIN FORM ---
				<Panel className="max-w-sm mx-auto p-8 text-center">
					<div className="w-12 h-12 bg-raised rounded-full flex items-center justify-center mx-auto mb-4 text-ink">
						<Send size={24} />
					</div>
					<h3 className="text-lg font-semibold text-ink mb-6">
						Connect Telegram
					</h3>

					{telegramAuthState === "PHONE" && (
						<div className="space-y-4">
							<input
								value={telegramPhoneNumber}
								onChange={(e) => setTelegramPhoneNumber(e.target.value)}
								placeholder="+1234567890"
								className={`${ui.input} text-center py-3`}
								disabled={isWaitingCode}
							/>
							<Button
								variant="primary"
								className="w-full"
								onClick={handleSendCodeTelegram}
								disabled={isWaitingCode}
							>
								{isWaitingCode ? (
									<SpinnerSmall className="animate-spin" />
								) : (
									"Send Code"
								)}
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
								disabled={isWaitingLogin}
							/>
							<Button
								variant="primary"
								className="w-full"
								onClick={handleLoginTelegram}
								disabled={isWaitingLogin}
							>
								{isWaitingLogin ? (
									<SpinnerSmall className="animate-spin" />
								) : (
									"Verify Code"
								)}
							</Button>
						</div>
					)}

					{telegramAuthState === "PASSWORD" && (
						<div className="space-y-4">
							<p className="text-sm text-warning">2FA Password Required</p>
							<input
								type="password"
								value={telegramPassword}
								onChange={(e) => setTelegramPassword(e.target.value)}
								placeholder="Cloud Password"
								className={`${ui.input} text-center py-3`}
								disabled={isWaitingLogin}
							/>
							<Button
								variant="primary"
								className="w-full"
								onClick={handleLoginTelegram}
								disabled={isWaitingLogin}
							>
								{isWaitingLogin ? (
									<SpinnerSmall className="animate-spin" />
								) : (
									"Verify"
								)}
							</Button>
						</div>
					)}
				</Panel>
			) : (
				// --- CONNECTED: SEARCH UI ---
				<>
					<Panel className="p-4 mb-6">
						<label
							htmlFor="telegram-query"
							className="block text-xs font-semibold text-faint mb-2"
						>
							Search for
						</label>
						<input
							id="telegram-query"
							value={searchText}
							onChange={(e) => setSearchText(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") handleSearchFromTelegram();
							}}
							className={`${ui.input} mb-1`}
							placeholder={query}
							maxLength={200}
						/>
						<p className="text-xs text-faint mb-4">
							Searches all your channels. Also tries other spellings (“5 cm” and
							“5cm”) and the title's alternate names from your *Arr.
						</p>
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
					</Panel>

					<div className="space-y-3">
						{telegramSearchResults.length === 0 && !isLoading && (
							<div className="text-center py-12 text-faint border-2 border-dashed border-line rounded-2xl">
								<Send size={32} className="mx-auto mb-3 opacity-20" />
								<p>Search your channels to find media.</p>
							</div>
						)}

						<div className="space-y-2">
							{telegramSearchResults.map((msg, i) => (
								<ListItem
									key={`${msg.channel}:${msg.id}`}
									className={
										msg.score != null && msg.score < WEAK ? "opacity-60" : ""
									}
								>
									<div
										className="flex items-center gap-4 overflow-hidden"
										title={msg.filename}
									>
										<div className="w-10 h-10 rounded-lg bg-raised flex items-center justify-center shrink-0 text-ink">
											<FileVideo size={20} />
										</div>
										<div className="min-w-0">
											<h4 className="text-sm font-medium text-ink truncate pr-4">
												{msg.messageText}
											</h4>
											<h4 className="text-sm font-medium text-ink truncate pr-4">
												{msg.filename}
											</h4>
											<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted mt-1">
												{i === 0 && msg.score >= STRONG && (
													<span className={ui.pillPositive}>Best match</span>
												)}
												{msg.score != null && msg.score < WEAK && (
													<span className={ui.pillNeutral}>Weak match</span>
												)}
												{msg.channelTitle && (
													<>
														<span className="truncate max-w-48">
															{msg.channelTitle}
														</span>
														<span>•</span>
													</>
												)}
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
										disabled={grabbingId === `${msg.channel}:${msg.id}`}
									>
										{grabbingId === `${msg.channel}:${msg.id}`
											? "Grabbing..."
											: "Grab"}
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
