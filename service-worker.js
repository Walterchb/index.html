/* Offline layer — v14. Network-first prevents stale interface files after an update. */
const CACHE_NAME = "course1-study-reader-v14";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=14.0.0",
  "./script.js?v=14.0.0",
  "./manifest.webmanifest",
  "./assets/app-icon.svg",
  "./data/course-manifest.js",
  "./data/page-registry.js",
  "./data/content-registry.js",
  "./data/visual-registry.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200 && response.type === "basic") {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("./index.html")))
  );
});
