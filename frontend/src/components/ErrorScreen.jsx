import { X, RefreshCw } from "lucide-react";

const ErrorScreen = () => {
	return (
		<div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6">
			<div className="max-w-md w-full bg-gray-900 border border-red-500/20 rounded-2xl p-8 text-center shadow-2xl shadow-red-500/5">
				<div className="inline-flex p-4 rounded-full bg-red-500/10 text-red-500 mb-6">
					<X size={40} />
				</div>
				<h2 className="text-2xl font-bold text-white mb-2">
					Connection Failed
				</h2>
				<p className="text-gray-400 mb-8">
					Unable to reach the EZIARR backend. Please ensure the server is
					running and accessible.
				</p>
				<button
					type="button"
					onClick={() => window.location.reload()}
					className="w-full py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
				>
					<RefreshCw size={18} /> Retry Connection
				</button>
			</div>
		</div>
	);
};

export default ErrorScreen;
