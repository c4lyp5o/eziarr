import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import App from "./App.jsx";
import { ToastContainer } from "./context/Toast.jsx";

import "./index.css";

createRoot(document.getElementById("root")).render(
	<StrictMode>
		<MotionConfig reducedMotion="user">
			<ToastContainer placement="bottom-right" />
			<App />
		</MotionConfig>
	</StrictMode>,
);
