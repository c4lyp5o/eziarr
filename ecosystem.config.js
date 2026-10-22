module.exports = {
	apps: [
		{
			name: "server",
			script: "./backend/index.js",
			interpreter: "bun",
			instances: 1,
			exec_mode: "fork",
			autorestart: true,
			watch: false,
			env: {
				NODE_ENV: "development",
				PORT: 5000,
			},
			env_production: {
				NODE_ENV: "production",
				PORT: 5000,
			},
		},
		{
			name: "worker",
			script: "./backend/worker.js",
			interpreter: "bun",
			instances: 1,
			exec_mode: "fork",
			autorestart: true,
			watch: false,
			env: {
				NODE_ENV: "development",
				// logger.js: the worker writes worker.log. Under PM2 the entry
				// point is PM2's wrapper, so Bun.main can't tell the two apart.
				EZIARR_ROLE: "worker",
			},
			env_production: {
				NODE_ENV: "production",
				EZIARR_ROLE: "worker",
			},
		},
	],
};
