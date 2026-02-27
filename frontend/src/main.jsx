import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { ToastContainer } from "./context/Toast.jsx";

import "./index.css";

createRoot(document.getElementById("root")).render(
	<StrictMode>
		<ToastContainer placement="top-right" />
		<App />
	</StrictMode>,
);
