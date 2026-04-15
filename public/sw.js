const CACHE_VERSION = 2;
const CACHE_NAME = `omega-v${CACHE_VERSION}`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.map((name) => caches.delete(name)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Let the browser handle all requests normally — no caching.
  // The SW exists only to enable PWA installability.
});
