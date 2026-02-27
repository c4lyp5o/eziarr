import { useState, useCallback, useEffect, useMemo } from "react";
import { X } from "lucide-react";
const PLACEMENT_CONFIG = {
	"top-right": {
		container: "top-4 right-4 items-end",
		enter: "animate-slide-in-right",
		exit: "animate-slide-out-right",
	},
	"top-left": {
		container: "top-4 left-4 items-start",
		enter: "animate-slide-in-left",
		exit: "animate-slide-out-left",
	},
	"top-center": {
		container: "top-4 left-1/2 -translate-x-1/2 items-center",
		enter: "animate-slide-in-top",
		exit: "animate-slide-out-top",
	},
	"bottom-right": {
		container: "bottom-4 right-4 items-end",
		enter: "animate-slide-in-right",
		exit: "animate-slide-out-right",
	},
	"bottom-left": {
		container: "bottom-4 left-4 items-start",
		enter: "animate-slide-in-left",
		exit: "animate-slide-out-left",
	},
	"bottom-center": {
		container: "bottom-4 left-1/2 -translate-x-1/2 items-center",
		enter: "animate-slide-in-bottom",
		exit: "animate-slide-out-bottom",
	},
};

const listeners = new Set();

export const ToastContainer = ({ placement = "bottom-right" }) => {
	const [toasts, setToasts] = useState([]);

	const config = useMemo(
		() => PLACEMENT_CONFIG[placement] || PLACEMENT_CONFIG["bottom-right"],
		[placement],
	);

	const removeToast = useCallback((id) => {
		setToasts((prev) =>
			prev.map((toast) =>
				toast.id === id ? { ...toast, exiting: true } : toast,
			),
		);

		setTimeout(() => {
			setToasts((prev) => prev.filter((toast) => toast.id !== id));
		}, 300);
	}, []);

	useEffect(() => {
		const handleToast = ({ message, type, duration }) => {
			const id = Date.now() + Math.random();
			const newToast = { id, message, type };

			setToasts((prev) => [...prev, newToast]);

			if (duration) {
				setTimeout(() => removeToast(id), duration);
			}
		};

		listeners.add(handleToast);
		return () => listeners.delete(handleToast);
	}, [removeToast]);

	return (
		<div
			className={`fixed z-100 flex flex-col gap-2 pointer-events-none ${config.container}`}
		>
			{toasts.map((toast) => (
				<ToastItem
					key={toast.id}
					{...toast}
					config={config} // Pass animation config down
					onClose={() => removeToast(toast.id)}
				/>
			))}
		</div>
	);
};

const ToastItem = ({ message, type, exiting, onClose, config }) => {
	const styles = {
		success: "bg-green-600 border-green-700 text-white",
		error: "bg-red-600 border-red-700 text-white",
		info: "bg-blue-600 border-blue-700 text-white",
		warning: "bg-amber-500 border-amber-600 text-black",
	};

	return (
		<div
			role="alert"
			className={`
        pointer-events-auto 
        flex items-center justify-between 
        min-w-80 max-w-sm 
        p-4 rounded-lg shadow-lg border-l-4 
        transition-all
        ${styles[type] || styles.info}
        ${exiting ? config.exit : config.enter}
      `}
		>
			<p className="text-sm font-medium pr-4">{message}</p>
			<button
				type="button"
				onClick={onClose}
				className="opacity-70 hover:opacity-100 transition-opacity p-1 cursor-pointer"
				aria-label="Close"
			>
				<X size={18} />
			</button>
		</div>
	);
};

export const toast = (message, type = "info", duration = 3000) => {
	listeners.forEach((listener) => {
		listener({ message, type, duration });
	});
};

toast.success = (message, duration) => toast(message, "success", duration);
toast.error = (message, duration) => toast(message, "error", duration);
toast.info = (message, duration) => toast(message, "info", duration);
toast.warning = (message, duration) => toast(message, "warning", duration);

export const useToast = () => ({ toast });
