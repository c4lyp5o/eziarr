import { useState, useCallback, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X, Check, AlertTriangle, Info, CircleAlert } from "lucide-react";

import { spring } from "../ui/motion";

const PLACEMENT = {
	"top-right": "top-4 right-4 items-end",
	"top-left": "top-4 left-4 items-start",
	"top-center": "top-4 left-1/2 -translate-x-1/2 items-center",
	"bottom-right": "bottom-4 inset-x-4 sm:left-auto sm:right-4 items-stretch sm:items-end",
	"bottom-left": "bottom-4 left-4 items-start",
	"bottom-center": "bottom-4 left-1/2 -translate-x-1/2 items-center",
};

// Status lives on the small mark, never on the whole toast.
const TYPES = {
	success: { icon: Check, mark: "bg-pos-bg text-positive" },
	error: { icon: CircleAlert, mark: "bg-neg-bg text-negative" },
	info: { icon: Info, mark: "bg-raised text-ink" },
	warning: { icon: AlertTriangle, mark: "bg-warn-bg text-warning" },
};

const listeners = new Set();

export const ToastContainer = ({ placement = "bottom-right" }) => {
	const [toasts, setToasts] = useState([]);
	const fromTop = placement.startsWith("top");

	const removeToast = useCallback((id) => {
		setToasts((prev) => prev.filter((toast) => toast.id !== id));
	}, []);

	useEffect(() => {
		const handleToast = ({ message, type, duration }) => {
			const id = Date.now() + Math.random();
			setToasts((prev) => [...prev.slice(-3), { id, message, type }]);
			if (duration) setTimeout(() => removeToast(id), duration);
		};

		listeners.add(handleToast);
		return () => listeners.delete(handleToast);
	}, [removeToast]);

	return (
		<div
			className={`fixed z-100 flex flex-col gap-2 pointer-events-none ${PLACEMENT[placement] || PLACEMENT["bottom-right"]}`}
			aria-live="polite"
		>
			<AnimatePresence initial={false}>
				{toasts.map((toast) => (
					<ToastItem
						key={toast.id}
						{...toast}
						fromTop={fromTop}
						onClose={() => removeToast(toast.id)}
					/>
				))}
			</AnimatePresence>
		</div>
	);
};

const ToastItem = ({ message, type, onClose, fromTop }) => {
	const { icon: Icon, mark } = TYPES[type] || TYPES.info;

	return (
		<motion.div
			layout
			role={type === "error" ? "alert" : "status"}
			initial={{ opacity: 0, y: fromTop ? -16 : 16, scale: 0.96 }}
			animate={{ opacity: 1, y: 0, scale: 1 }}
			exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.15 } }}
			transition={spring}
			drag="x"
			dragConstraints={{ left: 0, right: 0 }}
			dragElastic={0.6}
			onDragEnd={(_e, info) => Math.abs(info.offset.x) > 80 && onClose()}
			className="pointer-events-auto flex items-center gap-3 sm:min-w-80 sm:max-w-sm pl-3 pr-2 py-2.5 rounded-2xl bg-surface text-ink shadow-[0_12px_32px_rgb(0_0_0/0.35)] ring-1 ring-line"
		>
			<span className={`size-7 shrink-0 grid place-items-center rounded-full ${mark}`}>
				<Icon size={15} strokeWidth={2.25} />
			</span>
			<p className="text-sm flex-1">{message}</p>
			<button
				type="button"
				onClick={onClose}
				className="size-7 grid place-items-center rounded-full text-faint hover:text-ink hover:bg-raised transition-colors cursor-pointer"
				aria-label="Dismiss"
			>
				<X size={15} />
			</button>
		</motion.div>
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
