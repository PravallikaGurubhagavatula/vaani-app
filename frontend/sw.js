/* ================================================================
   Vaani Service Worker v5.0  — FIX 4: INSTANT UPDATES
   - skipWaiting on install AND on message (belt + suspenders)
   - clients.claim() immediately on activate
   - Delete ALL old caches on activate
   - Network-first for JS/CSS/HTML — never stale code
   - Reload notification via SW_UPDATED message
   - Bump CACHE_VERSION to bust all existing caches now
================================================================ */
const CACHE_VERSION = "vaani-v20";
const CACHE_NAME    = CACHE_VERSION;

// ── INSTALL: skip waiting immediately ──────────────────────────
self.addEventListener("install", event => {
  console.log("[SW] Installing", CACHE_VERSION);
  // FIX 4: skipWaiting immediately — never queue behind old SW
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(["/", "/index.html", "/manifest.json"])
        .catch(() => {/* Non-fatal — offline pre-cache best-effort */});
    })
  );
});

// ── ACTIVATE: delete ALL old caches, claim all clients ────────
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
      // FIX 4: claim() immediately — no page reload needed for first activation
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: "window", includeUncontrolled: true }))
      .then(clients => {
        // Notify all open tabs to reload for the new version
        clients.forEach(client => {
          client.postMessage({ type: "SW_UPDATED", version: CACHE_VERSION });
        });
      })
  );
});

// ── FETCH: network-first for app code, cache-first for images ──
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Skip cross-origin (API, CDN, fonts, Firebase)
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;
  const ext  = path.split(".").pop().toLowerCase();

  // HTML, SW, manifest → ALWAYS network, never cached
  if (
    path === "/" || path === "/index.html" || path === "/sw.js" ||
    path === "/manifest.json" || path.endsWith(".html")
  ) {
    event.respondWith(
      fetch(req, { cache: "no-store" }).catch(() => caches.match(req))
    );
    return;
  }

  // JS and CSS → NETWORK-FIRST (FIX 4: never serve stale app code)
  if (ext === "js" || ext === "css") {
    event.respondWith(
      fetch(req, { cache: "no-store" })
        .then(res => {
          if (res?.ok) {
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

  // Images / icons → cache-first (truly static assets)
  if (["png","jpg","jpeg","webp","ico","svg"].includes(ext)) {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req, { cache: "no-store" }).then(res => {
          if (res?.ok) {
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
// FIX 4: Respond to both "SKIP_WAITING" string and object form
self.addEventListener("message", event => {
  if (event.data === "SKIP_WAITING" || event.data?.type === "SKIP_WAITING") {
    console.log("[SW] SKIP_WAITING received — activating now");
    self.skipWaiting();
  }
});
