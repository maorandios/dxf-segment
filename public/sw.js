const CACHE_VERSION = 3;
const CACHE_NAME = `omega-v${CACHE_VERSION}`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.map((name) => caches.delete(name))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: "window" }))
      .then((clients) => {
        for (const client of clients) {
          client.postMessage({ type: "SW_ACTIVATED_V3" });
        }
      })
  );
});

self.addEventListener("fetch", () => {
  // No-op: let the browser handle all requests normally.
});
