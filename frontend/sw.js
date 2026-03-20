/* ================================================================
   Vaani Service Worker v3.0
   FIX 2: Proper cache-busting update strategy
   - skipWaiting on install (immediate activation)
   - Delete ALL old caches on activate
   - Network-first for JS/CSS (never serve stale)
   - Notify all clients to reload on new SW activation
================================================================ */
const CACHE_VERSION = "vaani-v15";
const CACHE_NAME    = CACHE_VERSION;

// ── INSTALL: skip waiting immediately ──────────────────────────
self.addEventListener("install", event => {
  console.log("[SW] Installing", CACHE_VERSION);
  // FIX: Always skip waiting so new SW activates immediately
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Pre-cache only essential shell assets
      return cache.addAll([
        "/",
        "/index.html",
        "/manifest.json"
      ]).catch(() => {/* Non-fatal: offline shell pre-cache failed */});
    })
  );
});

// ── ACTIVATE: delete old caches, claim clients, notify reload ──
self.addEventListener("activate", event => {
  console.log("[SW] Activating", CACHE_VERSION);
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => {
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

// ── FETCH: network-first for JS/CSS, cache-first for images ────
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Skip cross-origin requests entirely (API, CDN, fonts, Firebase)
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;
  const ext  = path.split(".").pop().toLowerCase();

  // HTML, SW, manifest → ALWAYS network-first, never cache
  if (
    path === "/" ||
    path === "/index.html" ||
    path === "/sw.js" ||
    path === "/manifest.json" ||
    path.endsWith(".html")
  ) {
    event.respondWith(
      fetch(req, { cache: "no-store" })
        .catch(() => caches.match(req))
    );
    return;
  }

  // JS and CSS → NETWORK-FIRST (fixes stale app bug)
  // If network fails fall back to cache
  if (ext === "js" || ext === "css") {
    event.respondWith(
      fetch(req, { cache: "no-store" })
        .then(res => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(req, clone));
          }
          return res;
        })
        .catch(() => caches.match(req).then(cached => {
          if (cached) return cached;
          return new Response("/* offline */", {
            status: 503,
            headers: { "Content-Type": "text/javascript" }
          });
        }))
    );
    return;
  }

  // Images / icons → cache-first (they don't change often)
  if (["png","jpg","jpeg","webp","ico","svg"].includes(ext)) {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req, { cache: "no-store" }).then(res => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(req, clone));
          }
          return res;
        }).catch(() => new Response("", { status: 503 }));
      })
    );
    return;
  }

  // Everything else → network-first
  event.respondWith(
    fetch(req, { cache: "no-store" })
      .catch(() => caches.match(req).then(c => c || new Response("Offline", { status: 503 })))
  );
});

// ── MESSAGE: handle SKIP_WAITING from page ─────────────────────
self.addEventListener("message", event => {
  if (event.data === "SKIP_WAITING") {
    console.log("[SW] SKIP_WAITING received");
    self.skipWaiting();
  }
});
