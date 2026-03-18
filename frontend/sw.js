/* ================================================================
   Vaani Service Worker v2.0
   HOW TO UPDATE ALL DEVICES INSTANTLY:
   Change CACHE_VERSION below every deploy → forces all devices to
   wipe old caches and reload automatically.
   vaani-v13 → vaani-v14 → vaani-v15 ...
================================================================ */

const CACHE_VERSION = "vaani-v13";
const CACHE_NAME    = CACHE_VERSION;

self.addEventListener("install", event => {
  console.log("[SW] Installing", CACHE_VERSION);
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  console.log("[SW] Activating", CACHE_VERSION);
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log("[SW] Deleting old cache:", k);
          return caches.delete(k);
        })
      ))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: "window", includeUncontrolled: true }))
      .then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: "SW_UPDATED", version: CACHE_VERSION });
        });
      })
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Skip cross-origin (API calls, CDN, fonts, Firebase)
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;

  // HTML, SW, manifest → always fetch fresh (never cache)
  if (
    path === "/" || path === "/index.html" ||
    path === "/sw.js" || path === "/manifest.json" ||
    path.endsWith(".html")
  ) {
    event.respondWith(
      fetch(req, { cache: "no-store" })
        .catch(() => caches.match(req))
    );
    return;
  }

  // JS/CSS/PNG (versioned with ?v=xxx): cache-first
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req, { cache: "no-store" }).then(res => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone));
        }
        return res;
      }).catch(() => new Response("Offline", { status: 503 }));
    })
  );
});

self.addEventListener("message", event => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
