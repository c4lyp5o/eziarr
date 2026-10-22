import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import App from "./App.jsx";
import { ToastContainer } from "./context/Toast.jsx";

import "./index.css";

// Only for notifications; see public/sw.js. Not available over plain http
// except on localhost, which is fine: the rest of the app doesn't need it.
if ("serviceWorker" in navigator)
	navigator.serviceWorker.register("/sw.js").catch(() => {});

createRoot(document.getElementById("root")).render(
	<StrictMode>
		<MotionConfig reducedMotion="user">
			<ToastContainer placement="bottom-right" />
			<App />
		</MotionConfig>
	</StrictMode>,
);
