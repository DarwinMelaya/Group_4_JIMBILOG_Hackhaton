/* global self, importScripts, caches, fetch, Response */
/* KALINGA service worker (hand-written, versioned). Caches public static assets only.
   Bump VERSION on every release: activate deletes caches from other versions. */
const VERSION = '1';
importScripts('/cache-policy.js');
const P = self.KalingaCachePolicy;
const CACHE = P.cacheName(VERSION);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(P.PRECACHE_URLS)));
  /* No automatic skipWaiting: the page asks for it via a SKIP_WAITING message. */
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => P.isStaleCache(n, VERSION)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const kind = P.classifyRequest(event.request, self.location.origin);
  if (kind === 'bypass') return; /* never touch API, non-GET, private, cross-origin */
  if (kind === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(P.OFFLINE_URL).then((r) => r || Response.error())),
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then((hit) => {
      if (hit) return hit;
      return fetch(event.request).then((res) => {
        if (P.isCacheableResponse(res)) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(event.request, copy));
        }
        return res;
      });
    }),
  );
});
