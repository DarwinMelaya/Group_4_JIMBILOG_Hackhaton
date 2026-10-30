/* global self, importScripts, caches, fetch, Response, URL */
/* KALINGA service worker (hand-written, versioned). Caches public static assets only.
   Bump VERSION on every release: activate deletes caches from other versions. */
const VERSION = '1';
/* Relative on purpose: resolves next to this script, so it follows the registered base path. */
importScripts('cache-policy.js');
const P = self.KalingaCachePolicy;
const CACHE = P.cacheName(VERSION);

/* Cache write that can never reject: a full disk or quota error must not break a response. */
function putSafe(request, response) {
  return caches
    .open(CACHE)
    .then((c) => c.put(request, response))
    .catch(() => undefined);
}

/* Fetches from the network. The clone is taken synchronously, before the page reads the body.
   Resolves { res, write }: `write` is a promise that never rejects, to be passed to event.waitUntil. */
function fetchAndCache(request, init) {
  return fetch(request, init).then((res) => {
    const pathname = new URL(typeof request === 'string' ? request : request.url, self.location.origin).pathname;
    const write = P.isCacheableStaticResponse(res, pathname) ? putSafe(request, res.clone()) : Promise.resolve();
    return { res, write };
  });
}

self.addEventListener('install', (event) => {
  /* Per-URL add: one missing optional icon must not abort the install. Only the offline page is required. */
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(
        P.PRECACHE_URLS.map((url) =>
          cache.add(url).then(
            () => ({ url, ok: true }),
            () => ({ url, ok: false }),
          ),
        ),
      ).then((results) => {
        const missing = results.filter((r) => !r.ok && P.REQUIRED_PRECACHE_URLS.indexOf(r.url) !== -1);
        if (missing.length > 0) throw new Error('required precache failed: ' + missing.map((r) => r.url).join(', '));
      }),
    ),
  );
  /* No automatic skipWaiting: the page asks for it via a SKIP_WAITING message after the user accepts the update. */
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

/* The offline page is normally only read from the cache (as a fallback), so a stale-while-revalidate on its own
   URL would never run. Refresh it after a successful navigation, at most once per worker lifetime. */
let offlineRefreshed = false;
function refreshOfflinePage() {
  if (offlineRefreshed) return Promise.resolve();
  offlineRefreshed = true;
  return fetchAndCache(P.OFFLINE_URL, { cache: 'no-cache' }).then(({ write }) => write, () => undefined);
}

self.addEventListener('fetch', (event) => {
  const kind = P.classifyRequest(event.request, self.location.origin);
  if (kind === 'bypass') return; /* never touch API, non-GET, private, cross-origin */
  if (kind === 'navigate') {
    event.respondWith(
      fetch(event.request).then(
        (res) => {
          event.waitUntil(refreshOfflinePage());
          return res;
        },
        () => caches.match(P.OFFLINE_URL).then((r) => r || Response.error()),
      ),
    );
    return;
  }
  const strategy = P.staticStrategy(new URL(event.request.url).pathname);
  event.respondWith(
    caches.match(event.request).then((hit) => {
      if (strategy === 'immutable') {
        /* Hashed build output: cache-first, a hit is always correct. */
        if (hit) return hit;
        return fetchAndCache(event.request).then(({ res, write }) => {
          event.waitUntil(write);
          return res;
        });
      }
      /* Non-hashed files: answer from cache immediately, refresh in the background (stale-while-revalidate),
         so an edit without a VERSION bump still propagates on the next load. */
      const network = fetchAndCache(event.request, { cache: 'no-cache' }).then(({ res, write }) =>
        write.then(() => res),
      );
      if (hit) {
        event.waitUntil(network.catch(() => undefined));
        return hit;
      }
      return network;
    }),
  );
});
