import { motion } from "motion/react";
import { RefreshCw, CircleAlert } from "lucide-react";

import { spring } from "../ui/motion";
import { Button } from "./Buttons";
import { Mark } from "./Mark";

const ErrorScreen = () => {
	return (
		<div className="min-h-dvh bg-ground flex items-center justify-center px-4">
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
				<div className="bg-surface rounded-[20px] p-6">
					<h1 className="flex items-center gap-2 text-base font-semibold text-ink">
						<CircleAlert size={18} className="text-negative" />
						Can't reach the Eziarr server
					</h1>
					<p className="text-sm text-muted mt-2">
						The page loaded, but the API didn't answer. Check that the server
						is running, then try again.
					</p>
					<Button className="mt-5" onClick={() => window.location.reload()}>
						<RefreshCw size={15} /> Try again
					</Button>
				</div>
			</motion.div>
		</div>
	);
};

export default ErrorScreen;
