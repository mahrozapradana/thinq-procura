const CACHE = "epr-v2";
const API_CACHE = "epr-api-v1";
const OFFLINE_URLS = ["/", "/manifest.json"];
const CACHEABLE_API = [
  /\/api\/prs(\?|$|\/)/,
  /\/api\/pos(\?|$|\/)/,
  /\/api\/vendors(\?|$)/,
  /\/api\/products(\?|$)/,
  /\/api\/departments(\?|$)/,
  /\/api\/taxes(\?|$)/,
  /\/api\/dashboard\/stats/,
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(OFFLINE_URLS).catch(() => {})));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE && k !== API_CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Stale-while-revalidate for whitelisted GET API endpoints
  if (url.pathname.startsWith("/api/")) {
    const cacheable = CACHEABLE_API.some((rx) => rx.test(url.pathname));
    if (!cacheable) return; // let SSE and other API pass through
    e.respondWith(
      caches.open(API_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const fetcher = fetch(req).then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        }).catch(() => cached || new Response(JSON.stringify({ offline: true, items: [] }), {
          status: 200, headers: { "Content-Type": "application/json", "X-Offline": "1" }
        }));
        return cached || fetcher;
      })
    );
    return;
  }

  // Static assets
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
