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
			},
			env_production: {
				NODE_ENV: "production",
			},
		},
	],
};
