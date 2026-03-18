/* ================================================================
   Vaani Service Worker — auto-updates on every Vercel deployment
   Strategy:
   - index.html + sw.js: ALWAYS network-first (never cache)
   - JS / CSS / fonts:   Cache-first with version key
   - Images / icons:     Cache-first, long-lived
================================================================ */

// ── VERSION: change this string on every deployment to bust all caches ──
// The build script in index.html sets window.VAANI_VERSION,
// but sw.js uses its own constant for the cache name.
// Vercel auto-deploys update this file, so the new constant triggers
// the "activate" event which wipes old caches automatically.
const CACHE_VERSION = "vaani-v" + Date.now();
const STATIC_CACHE  = CACHE_VERSION;

// Files to pre-cache on install (app shell)
const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/style.css",
  "/app.js",
  "/manifest.json"
];

// ── INSTALL: pre-cache app shell ─────────────────────
self.addEventListener("install", event => {
  // Skip waiting immediately — don't wait for old SW to die
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      // Use cache-busting fetch to get fresh copies
      return Promise.allSettled(
        PRECACHE_URLS.map(url =>
          fetch(url + "?_sw=" + Date.now(), { cache: "no-store" })
            .then(res => res.ok ? cache.put(url, res) : null)
            .catch(() => null)
        )
      );
    })
  );
});

// ── ACTIVATE: delete ALL old caches immediately ───────
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== STATIC_CACHE)
          .map(key => {
            console.log("[SW] Deleting old cache:", key);
            return caches.delete(key);
          })
      )
    ).then(() => {
      // Take control of all open clients immediately
      return self.clients.claim();
    })
  );
});

// ── FETCH: Network-first for HTML, cache-first for assets ──
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  // Always skip non-GET requests
  if (event.request.method !== "GET") return;

  // Always skip cross-origin requests (API, CDN, fonts)
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;

  // ── HTML and SW: ALWAYS go to network, never serve stale ──
  if (path === "/" || path.endsWith(".html") || path.endsWith("sw.js") || path === "/manifest.json") {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .then(res => {
          // Update cache with fresh copy
          if (res.ok) {
            const clone = res.clone();
            caches.open(STATIC_CACHE).then(c => c.put(event.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(event.request)) // offline fallback
    );
    return;
  }

  // ── JS / CSS / images: Cache-first, but version query string busts cache ──
  // Since index.html appends ?v=TIMESTAMP to app.js and style.css,
  // any new deployment gets a fresh URL → new cache entry → fresh file
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request, { cache: "no-store" }).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(STATIC_CACHE).then(c => c.put(event.request, clone));
        }
        return res;
      }).catch(() => cached || new Response("Offline", { status: 503 }));
    })
  );
});

// ── MESSAGE: force update when app sends "SKIP_WAITING" ──
self.addEventListener("message", event => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
