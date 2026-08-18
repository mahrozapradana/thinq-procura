const CACHE = "epr-v1";
const OFFLINE_URLS = ["/", "/manifest.json"];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(OFFLINE_URLS).catch(() => {})));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  // Only handle GET
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Never cache API calls — let them go to network (SSE etc.)
  if (url.pathname.startsWith("/api/")) return;
  // Cache-first for static assets, network-first for navigation
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).catch(() => caches.match("/") || new Response("Offline", { status: 503 }))
    );
    return;
  }
  e.respondWith(
    caches.match(req).then((cached) => {
      const fetcher = fetch(req).then((res) => {
        if (res.ok && res.type === "basic") {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(req, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || fetcher;
    })
  );
});
