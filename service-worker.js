/* Cache only this application's public shell. Private records/files stay in scoped IndexedDB. */
const PREFIX = "study-atlas-v3-";
const CACHE = PREFIX + "reader-v4-20260922";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./config.js",
  "./app/main.js",
  "./app/store.js",
  "./app/auth.js",
  "./app/learning.js",
  "./app/seed.js",
  "./app/legacy.js",
  "./app/importer.js",
  "./app/book-importer.js",
  "./app/book-course.js",
  "./app/pdf-reader.js",
  "./app/pdf-reader.css",
  "./app/ai.js",
  "./vendor/purify.js",
  "./vendor/supabase.js",
  "./assets/app-icon.svg",
  "./manifest.webmanifest",
];
self.addEventListener("install", (event) =>
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                (key.startsWith(PREFIX) ||
                  key.startsWith("course1-study-reader-")) &&
                key !== CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (event) => {
  const req = event.request,
    url = new URL(req.url),
    base = new URL("./", self.location.href);
  if (
    req.method !== "GET" ||
    url.origin !== base.origin ||
    !url.pathname.startsWith(base.pathname)
  )
    return;
  const relative = url.pathname.slice(base.pathname.length);
  if (
    !/^(?:$|index\.html$|styles\.css$|config\.js$|manifest\.webmanifest$|app\/|vendor\/|assets\/app-icon\.svg$|docs\/)/.test(
      relative,
    )
  )
    return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        if (req.mode === "navigate")
          return (await caches.match("./index.html")) || Response.error();
        return Response.error();
      }),
  );
});
