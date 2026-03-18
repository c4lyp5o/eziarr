import { useState, useEffect } from "react";
import {
	Lock,
	User,
	LogIn,
	Loader2,
	LayoutGrid,
	ShieldCheck,
} from "lucide-react";

import { apiCall } from "../utils/apiCall";

const SetUpInitialUserAndPassword = ({ onClose }) => {
	const [credentials, setCredentials] = useState({
		username: "",
		password: "",
		repeatPassword: "",
	});
	const [error, setError] = useState("");
	const [isLoading, setIsLoading] = useState(false);

	const handleSaveUsernameAndPassword = async (e) => {
		e.preventDefault();
		setError("");

		if (!credentials.username || !credentials.password) {
			setError("Please enter both username and password.");
			return;
		}

		if (credentials.password !== credentials.repeatPassword) {
			setError("Passwords do not match.");
			return;
		}

		try {
			setIsLoading(true);
			await apiCall("/api/v1/firsttime", {
				method: "POST",
				body: credentials,
			});
			onClose();
		} catch (err) {
			console.error("Failed to login", err);
			setError(err.message);
		} finally {
			setIsLoading(false);
		}
	};

	const handleChange = (e) => {
		const { name, value } = e.target;
		setCredentials((prev) => ({ ...prev, [name]: value }));
	};

	return (
		<div className="absolute inset-0 z-50 flex items-center justify-center bg-[#0a0a0a]/95 backdrop-blur-md p-4 animate-in fade-in duration-500">
			<div className="bg-gray-900/50 backdrop-blur-xl border border-emerald-500/30 w-full max-w-md rounded-2xl flex flex-col shadow-[0_0_50px_-12px_rgba(16,185,129,0.2)] overflow-hidden">
				<div className="p-8 text-center pb-6">
					<div className="w-16 h-16 rounded-2xl bg-linear-to-tr from-emerald-400 to-emerald-600 flex items-center justify-center shadow-xl shadow-emerald-500/20 mx-auto mb-5">
						<ShieldCheck className="text-white" size={32} />
					</div>
					<h2 className="text-2xl font-bold text-white mb-2">
						Welcome to Eziarr!
					</h2>
					<p className="text-sm text-gray-400 font-medium">
						Lets set up your credentials!
					</p>
				</div>

				<form
					onSubmit={handleSaveUsernameAndPassword}
					className="px-8 pb-8 space-y-4"
				>
					{error && (
						<div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400 text-center animate-in slide-in-from-top-2">
							{error}
						</div>
					)}

					<div>
						{/** biome-ignore lint/a11y/noLabelWithoutControl: false positive */}
						<label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
							Username
						</label>
						<div className="relative">
							<div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
								<User size={18} />
							</div>
							<input
								type="text"
								name="username"
								value={credentials.username}
								onChange={handleChange}
								className="block w-full pl-10 pr-4 py-3 bg-[#0f0f10] border border-gray-800 rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all disabled:opacity-50"
								placeholder="Choose a username"
								disabled={isLoading}
								// biome-ignore lint/a11y/noAutofocus: false positive
								autoFocus
							/>
						</div>
					</div>

					<div>
						{/** biome-ignore lint/a11y/noLabelWithoutControl: false positive */}
						<label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
							Password
						</label>
						<div className="relative">
							<div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
								<Lock size={18} />
							</div>
							<input
								type="password"
								name="password"
								value={credentials.password}
								onChange={handleChange}
								className="block w-full pl-10 pr-4 py-3 bg-[#0f0f10] border border-gray-800 rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all disabled:opacity-50"
								placeholder="••••••••"
								disabled={isLoading}
							/>
						</div>
					</div>

					<div>
						{/** biome-ignore lint/a11y/noLabelWithoutControl: false positive */}
						<label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
							Repeat Password
						</label>
						<div className="relative">
							<div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
								<Lock size={18} />
							</div>
							<input
								type="password"
								name="repeatPassword"
								value={credentials.repeatPassword}
								onChange={handleChange}
								className="block w-full pl-10 pr-4 py-3 bg-[#0f0f10] border border-gray-800 rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all disabled:opacity-50"
								placeholder="••••••••"
								disabled={isLoading}
							/>
						</div>
					</div>

					<button
						type="submit"
						disabled={isLoading}
						className="w-full mt-6 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white py-3 px-4 rounded-xl font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-600/20"
					>
						{isLoading ? (
							<>
								<Loader2 size={18} className="animate-spin" /> Securing
								Server...
							</>
						) : (
							"Complete Setup"
						)}
					</button>
				</form>
			</div>
		</div>
	);
};

const Login = ({ onLoginSuccess }) => {
	const [credentials, setCredentials] = useState({
		username: "",
		password: "",
	});
	const [rememberMe, setRememberMe] = useState(true);

	const [error, setError] = useState("");
	const [isLoading, setIsLoading] = useState(false);

	const [isCheckingFirstTime, setIsCheckingFirstTime] = useState(true);
	const [isFirstTime, setIsFirstTime] = useState(false);

	const handleLogin = async (e) => {
		e.preventDefault();
		setError("");

		if (!credentials.username || !credentials.password) {
			setError("Please enter both username and password.");
			return;
		}

		try {
			setIsLoading(true);
			await apiCall("/api/v1/login", {
				method: "POST",
				body: { ...credentials, rememberMe },
			});
			onLoginSuccess();
		} catch (err) {
			console.error("Failed to login", err);
			setError(err.message || "Invalid username or password.");
		} finally {
			setIsLoading(false);
		}
	};

	const handleChange = (e) => {
		const { name, value } = e.target;
		setCredentials((prev) => ({ ...prev, [name]: value }));
	};

	useEffect(() => {
		const check1stTime = async () => {
			try {
				const res = await apiCall("/api/v1/firsttime");
				setIsFirstTime(res.isFirstTime);
			} catch (err) {
				setError(err.message);
			} finally {
				setIsCheckingFirstTime(false);
			}
		};

		check1stTime();
	}, []);

	if (isCheckingFirstTime) {
		return <div className="min-h-screen bg-[#0a0a0a]" />;
	}

	return (
		<div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-4 selection:bg-indigo-500/30">
			<div className="w-full max-w-md animate-in fade-in zoom-in-95 duration-500">
				<div className="flex flex-col items-center mb-8">
					<div className="w-16 h-16 rounded-2xl bg-linear-to-tr from-indigo-500 to-blue-600 flex items-center justify-center shadow-xl shadow-indigo-500/20 mb-4">
						<LayoutGrid className="text-white" size={32} />
					</div>
					<h1 className="text-3xl font-bold tracking-tight text-white mb-1">
						EZIARR
					</h1>
				</div>

				<div className="bg-gray-900/50 backdrop-blur-xl border border-gray-800 rounded-2xl shadow-2xl overflow-hidden p-6 sm:p-8">
					<form onSubmit={handleLogin} className="space-y-5">
						{error && (
							<div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400 text-center animate-in slide-in-from-top-2">
								{error}
							</div>
						)}

						<div>
							{/** biome-ignore lint/a11y/noLabelWithoutControl: false positive */}
							<label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
								Username
							</label>
							<div className="relative">
								<div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
									<User size={18} />
								</div>
								<input
									type="text"
									name="username"
									value={credentials.username}
									onChange={handleChange}
									className="block w-full pl-10 pr-4 py-3 bg-[#0f0f10] border border-gray-800 rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all"
									placeholder="admin"
									autoComplete="username"
									disabled={isLoading}
								/>
							</div>
						</div>

						<div>
							{/** biome-ignore lint/a11y/noLabelWithoutControl: false positive */}
							<label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
								Password
							</label>
							<div className="relative">
								<div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
									<Lock size={18} />
								</div>
								<input
									type="password"
									name="password"
									value={credentials.password}
									onChange={handleChange}
									className="block w-full pl-10 pr-4 py-3 bg-[#0f0f10] border border-gray-800 rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all"
									placeholder="••••••••"
									autoComplete="current-password"
									disabled={isLoading}
								/>
							</div>
						</div>

						<div className="flex items-center justify-between">
							<label className="flex items-center gap-2 text-sm text-gray-300 select-none">
								<input
									type="checkbox"
									checked={rememberMe}
									onChange={(e) => setRememberMe(e.target.checked)}
									className="h-4 w-4 accent-indigo-500"
								/>
								Remember me
							</label>

							<span className="text-xs text-gray-500">
								Keeps you signed in longer
							</span>
						</div>

						<button
							type="submit"
							disabled={isLoading}
							className="w-full mt-2 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white py-3 px-4 rounded-xl font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-600/20"
						>
							{isLoading ? (
								<>
									<Loader2 size={18} className="animate-spin" />{" "}
									Authenticating...
								</>
							) : (
								<>
									<LogIn size={18} /> Sign In
								</>
							)}
						</button>
					</form>
				</div>
			</div>

			{isFirstTime && (
				<SetUpInitialUserAndPassword onClose={() => setIsFirstTime(false)} />
			)}
		</div>
	);
};

export default Login;
