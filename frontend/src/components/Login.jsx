import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Loader2 } from "lucide-react";

import { apiCall } from "../utils/apiCall";
import { ui } from "../ui/styles";
import { spring } from "../ui/motion";

import { Button } from "./Buttons";
import { Mark } from "./Mark";

const Field = ({ id, label, ...props }) => (
	<div>
		<label htmlFor={id} className="block text-sm font-medium text-ink mb-2">
			{label}
		</label>
		<input id={id} className={`${ui.input} h-10`} {...props} />
	</div>
);

const ErrorLine = ({ error }) => (
	<AnimatePresence initial={false}>
		{error && (
			<motion.p
				role="alert"
				className="text-sm text-negative bg-neg-bg rounded-2xl px-4 py-2.5"
				initial={{ opacity: 0, height: 0, marginBottom: 0 }}
				animate={{
					opacity: 1,
					height: "auto",
					marginBottom: 16,
					x: [0, -6, 6, -3, 0],
				}}
				exit={{ opacity: 0, height: 0, marginBottom: 0 }}
				transition={{ ...spring, x: { duration: 0.32 } }}
			>
				{error}
			</motion.p>
		)}
	</AnimatePresence>
);

// The shared frame: the mark and name, one line on what this is, the form.
const Frame = ({ title, subtitle, children }) => (
	<div className="min-h-dvh bg-ground flex flex-col items-center justify-center px-4 py-10">
		<motion.div
			className="w-full max-w-sm"
			initial={{ opacity: 0, y: 16 }}
			animate={{ opacity: 1, y: 0 }}
			transition={spring}
		>
			<div className="flex items-center gap-2 mb-8 text-ink">
				<Mark size={28} />
				<span className="text-lg font-semibold tracking-[-0.01em]">Eziarr</span>
			</div>
			<h1 className="text-xl font-semibold text-ink">{title}</h1>
			<p className="text-sm text-muted mt-1 mb-6">{subtitle}</p>
			<div className="bg-surface rounded-[20px] p-5 sm:p-6">{children}</div>
		</motion.div>
	</div>
);

const SetUpInitialUserAndPassword = ({ onClose }) => {
	const [setupCode, setSetupCode] = useState("");
	const [password, setPassword] = useState("");
	const [repeatPassword, setRepeatPassword] = useState("");
	const [error, setError] = useState("");
	const [isLoading, setIsLoading] = useState(false);

	const handleSaveUsernameAndPassword = async (e) => {
		e.preventDefault();
		setError("");

		if (!setupCode.trim()) {
			setError("Enter the setup code from the server log.");
			return;
		}

		if (!password) {
			setError("Choose a password first.");
			return;
		}

		if (password !== repeatPassword) {
			setError("The two passwords don't match.");
			return;
		}

		try {
			setIsLoading(true);
			await apiCall("/api/v1/firsttime", {
				method: "POST",
				body: { password, setupCode },
			});
			onClose();
		} catch (err) {
			setError(err.message);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<Frame
			title="Set a password"
			subtitle="This server has no password yet. It protects every page and the API."
		>
			<form onSubmit={handleSaveUsernameAndPassword}>
				<ErrorLine error={error} />
				<div className="space-y-4">
					<div>
						<Field
							id="setup-code"
							label="Setup code"
							value={setupCode}
							onChange={(e) => setSetupCode(e.target.value)}
							placeholder="XXXX-XXXX"
							autoComplete="one-time-code"
							autoCapitalize="characters"
							spellCheck={false}
							disabled={isLoading}
							autoFocus
						/>
						<p className="text-xs text-faint mt-2">
							Printed in the server log when Eziarr starts:{" "}
							<span className="text-muted">docker logs eziarr</span>. It changes
							on every restart.
						</p>
					</div>
					<Field
						id="new-password"
						label="Password"
						type="password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						placeholder="At least 8 characters"
						autoComplete="new-password"
						minLength={8}
						disabled={isLoading}
					/>
					<Field
						id="repeat-password"
						label="Repeat password"
						type="password"
						value={repeatPassword}
						onChange={(e) => setRepeatPassword(e.target.value)}
						autoComplete="new-password"
						minLength={8}
						disabled={isLoading}
					/>
				</div>
				<Button
					type="submit"
					size="lg"
					className="w-full mt-6"
					disabled={isLoading}
				>
					{isLoading && <Loader2 size={16} className="animate-spin" />}
					{isLoading ? "Saving…" : "Save and continue"}
				</Button>
			</form>
		</Frame>
	);
};

const Login = ({ onLoginSuccess }) => {
	const [password, setPassword] = useState("");
	const [rememberMe, setRememberMe] = useState(true);

	const [error, setError] = useState("");
	const [isLoading, setIsLoading] = useState(false);

	const [isCheckingFirstTime, setIsCheckingFirstTime] = useState(true);
	const [isFirstTime, setIsFirstTime] = useState(false);

	const handleLogin = async (e) => {
		e.preventDefault();
		setError("");

		if (!password) {
			setError("Enter your password.");
			return;
		}

		try {
			setIsLoading(true);
			await apiCall("/api/v1/login", {
				method: "POST",
				body: { password, rememberMe },
			});
			onLoginSuccess();
		} catch (err) {
			setError(err.message || "That password didn't work.");
		} finally {
			setIsLoading(false);
		}
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
		return <div className="min-h-dvh bg-ground" />;
	}

	if (isFirstTime) {
		return (
			<SetUpInitialUserAndPassword onClose={() => setIsFirstTime(false)} />
		);
	}

	return (
		<Frame
			title="Sign in"
			subtitle="Find and grab what Radarr, Sonarr and Lidarr are still missing."
		>
			<form onSubmit={handleLogin}>
				<ErrorLine error={error} />
				<Field
					id="password"
					label="Password"
					type="password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					autoComplete="current-password"
					minLength={8}
					disabled={isLoading}
					autoFocus
				/>

				<label className="flex items-center gap-2.5 mt-4 text-sm text-muted select-none cursor-pointer">
					<input
						type="checkbox"
						checked={rememberMe}
						onChange={(e) => setRememberMe(e.target.checked)}
						className="size-4 accent-[var(--ink)]"
					/>
					Keep me signed in on this device
				</label>

				<Button
					type="submit"
					size="lg"
					className="w-full mt-6"
					disabled={isLoading}
				>
					{isLoading && <Loader2 size={16} className="animate-spin" />}
					{isLoading ? "Signing in…" : "Sign in"}
				</Button>
			</form>
		</Frame>
	);
};

export default Login;
