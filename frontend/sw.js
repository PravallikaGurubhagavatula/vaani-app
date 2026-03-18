/* ================================================================
   Vaani Service Worker
   IMPORTANT: Change CACHE_VERSION on every single deployment.
   This is the ONLY reliable way to force phones to update.
   When this string changes, all old caches are wiped and the
   new SW takes control of all open tabs immediately.
================================================================ */

// ── CHANGE THIS NUMBER EVERY TIME YOU PUSH TO GITHUB ──────────
// Just increment it: v1 → v2 → v3 → v4 ...
// This is what forces Android/iOS to dump old cached files.
const CACHE_VERSION = "vaani-v10";
// ──────────────────────────────────────────────────────────────

const CACHE_NAME = CACHE_VERSION;

// These are cached for offline use
const SHELL_URLS = ["/", "/index.html", "/style.css", "/app.js", "/manifest.json"];

// ── INSTALL ───────────────────────────────────────────────────
// Skip waiting immediately — don't queue behind old SW
self.addEventListener("install", event => {
  console.log("[SW] Installing", CACHE_VERSION);
  self.skipWaiting(); // <-- critical: take over right now, don't wait

  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        SHELL_URLS.map(url =>
          fetch(url, { cache: "no-store" })
            .then(res => { if (res.ok) cache.put(url, res); })
            .catch(() => {}) // don't crash install if one file fails
        )
      );
    })
  );
});

// ── ACTIVATE ──────────────────────────────────────────────────
// Wipe ALL caches from previous versions, then take over all tabs
self.addEventListener("activate", event => {
  console.log("[SW] Activating", CACHE_VERSION, "— wiping old caches");

  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log("[SW] Deleting old cache:", k);
          return caches.delete(k);
        })
      ))
      .then(() => self.clients.claim()) // take control of ALL open tabs now
      .then(() => {
        // Tell every open tab to reload so they get fresh content
        return self.clients.matchAll({ type: "window" }).then(clients => {
          clients.forEach(client => {
            client.postMessage({ type: "SW_UPDATED", version: CACHE_VERSION });
          });
        });
      })
  );
});

// ── FETCH ─────────────────────────────────────────────────────
self.addEventListener("fetch", event => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle GET requests from same origin
  if (req.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;

  // ── HTML files and SW itself: ALWAYS network, never cached ──
  // This is crucial — phones must always get the latest index.html
  if (
    path === "/" ||
    path === "/index.html" ||
    path === "/sw.js" ||
    path === "/manifest.json" ||
    path.endsWith(".html")
  ) {
    event.respondWith(
      fetch(req, { cache: "no-store" })
        .then(res => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(req, clone));
          }
          return res;
        })
        .catch(() => caches.match(req)) // offline fallback only
    );
    return;
  }

  // ── JS / CSS: cache-first BUT index.html loads them with ?v=xxx ──
  // So any new deployment = new URL = new cache entry = fresh file
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req, { cache: "no-store" }).then(res => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone));
        }
        return res;
      }).catch(() => cached || new Response("Offline", { status: 503 }));
    })
  );
});

// ── MESSAGE ───────────────────────────────────────────────────
self.addEventListener("message", event => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
