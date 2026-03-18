/* ================================================================
   Vaani Service Worker
   HOW TO UPDATE ALL DEVICES INSTANTLY:
   Every time you push to GitHub, just change CACHE_VERSION below.
   Increment: vaani-v11 → vaani-v12 → vaani-v13 ...
   That single change forces every phone/tablet/laptop to:
   1. Download the new SW
   2. Wipe all old caches
   3. Reload the page automatically — no manual refresh needed
================================================================ */

const CACHE_VERSION = "vaani-v11";
const CACHE_NAME    = CACHE_VERSION;

// ── INSTALL: take over immediately, don't queue ───────────────
self.addEventListener("install", event => {
  console.log("[SW] Installing", CACHE_VERSION);
  // skipWaiting() = don't wait for old SW to finish — take over NOW
  self.skipWaiting();
});

// ── ACTIVATE: wipe old caches, claim all tabs, force reload ───
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
      .then(() => {
        // Tell every open tab to hard-reload right now
        return self.clients.matchAll({ type: "window", includeUncontrolled: true })
          .then(clients => {
            clients.forEach(client => {
              // postMessage triggers the reload in index.html
              client.postMessage({ type: "SW_UPDATED", version: CACHE_VERSION });
            });
          });
      })
  );
});

// ── FETCH: HTML always from network, assets from cache ────────
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Skip cross-origin (API calls, CDN, fonts etc.)
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;

  // ── HTML, SW, manifest: ALWAYS fetch fresh from server ──────
  // This is what ensures phones get new content immediately
  if (
    path === "/" ||
    path === "/index.html" ||
    path === "/sw.js" ||
    path === "/manifest.json" ||
    path.endsWith(".html")
  ) {
    event.respondWith(
      fetch(req, { cache: "no-store" })
        .catch(() => caches.match(req)) // offline fallback only
    );
    return;
  }

  // ── JS/CSS: served from cache (URL has ?v=xxx so new deploy = new URL) ──
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

// ── MESSAGE: app can also trigger skip waiting manually ───────
self.addEventListener("message", event => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
