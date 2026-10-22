// Eziarr's service worker exists for one job: showing "Downloaded"
// notifications (Android only shows them through a worker) and bringing the
// app forward when one is tapped. It has no fetch handler and caches
// nothing, so every visit loads the current build from the server.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
	event.waitUntil(self.clients.claim()),
);

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	event.waitUntil(
		self.clients
			.matchAll({ type: "window", includeUncontrolled: true })
			.then((windows) => {
				const open = windows.find(
					(w) => new URL(w.url).origin === self.location.origin,
				);
				return open ? open.focus() : self.clients.openWindow("/");
			}),
	);
});
