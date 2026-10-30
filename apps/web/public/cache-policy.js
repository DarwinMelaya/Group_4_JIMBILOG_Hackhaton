/* global self, URL */
/* KALINGA service worker cache policy: pure functions, no side effects.
   Loaded by sw.js via importScripts and by unit tests inside a vm sandbox.
   Public static assets only; everything else bypasses the cache. */
(function (root) {
  'use strict';
  var CACHE_PREFIX = 'kalinga-static-';
  var OFFLINE_URL = '/offline.html';
  var OFFLINE_ASSET_URLS = ['/offline.css', '/offline.js']; /* external, so the offline page works under script-src/style-src 'self' */
  var PRECACHE_URLS = [OFFLINE_URL, OFFLINE_ASSET_URLS[0], OFFLINE_ASSET_URLS[1], '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon.svg'];
  /* The offline page is REQUIRED (install fails without it); every other precache entry is optional. */
  var REQUIRED_PRECACHE_URLS = [OFFLINE_URL];
  /* Private roots are matched by path SEGMENT: '/staff' and '/staff/...' match, '/staffing' does not. */
  var PRIVATE_ROOTS = ['/api', '/staff', '/admin'];
  var STATIC_PREFIXES = ['/assets/', '/icons/'];
  var STATIC_FILES = ['/manifest.json', '/offline.html', '/offline.css', '/offline.js'];

  function cacheName(version) { return CACHE_PREFIX + version; }

  /* Lower-cased, percent-decoded, duplicate slashes collapsed: routers are case-insensitive by default,
     so '/Staff', '//staff' and '/%73taff' must not slip past the private-path check. */
  function normalizePath(pathname) {
    var p = String(pathname);
    try { p = decodeURIComponent(p); } catch { /* keep the raw path */ }
    return p.toLowerCase().replace(/\/{2,}/g, '/');
  }

  function hasEncodedSeparator(pathname) {
    return /%(2f|5c|25)/i.test(String(pathname)) || String(pathname).indexOf(String.fromCharCode(92)) !== -1;
  }

  function isPrivatePath(pathname) {
    var p = normalizePath(pathname);
    for (var i = 0; i < PRIVATE_ROOTS.length; i++) {
      var root = PRIVATE_ROOTS[i];
      if (p === root || p.indexOf(root + '/') === 0) return true;
    }
    return false;
  }

  /* 'immutable': hashed /assets/* files, cache-first. 'revalidate': non-hashed files (/manifest.json,
     /icons/*, /offline.html) whose content can change without a VERSION bump: stale-while-revalidate. */
  function staticStrategy(pathname) {
    return String(pathname).indexOf('/assets/') === 0 ? 'immutable' : 'revalidate';
  }

  /* Returns 'bypass' | 'navigate' | 'static'. req: {method, url, mode}. */
  function classifyRequest(req, origin) {
    if (!req || String(req.method).toUpperCase() !== 'GET') return 'bypass';
    var u;
    try { u = new URL(req.url); } catch { return 'bypass'; }
    if (u.origin !== origin) return 'bypass';
    /* Encoded slashes/backslashes (and double encoding) never appear in our own URLs. A host or proxy that
       decodes them could map '/assets/..%2fapi' onto a private path, so such URLs bypass the cache entirely. */
    if (hasEncodedSeparator(u.pathname)) return 'bypass';
    if (isPrivatePath(u.pathname)) return 'bypass';
    if (req.mode === 'navigate') return 'navigate';
    if (u.search !== '' || u.hash !== '') return 'bypass';
    if (STATIC_FILES.indexOf(u.pathname) !== -1) return 'static';
    for (var j = 0; j < STATIC_PREFIXES.length; j++) {
      if (u.pathname.indexOf(STATIC_PREFIXES[j]) === 0) return 'static';
    }
    return 'bypass';
  }

  /* res: {status, type, headers: {get(name)}}. */
  function isCacheableResponse(res) {
    if (!res || res.status !== 200) return false;
    if (res.type === 'opaque' || res.type === 'error') return false;
    var h = res.headers;
    var cc = ((h && h.get('cache-control')) || '').toLowerCase();
    if (/(^|[\s,])(no-store|private|no-cache)([\s,=]|$)/.test(cc)) return false;
    if (h && h.get('set-cookie')) return false;
    if (((h && h.get('vary')) || '').indexOf('*') !== -1) return false;
    return true;
  }

  /* Static assets must not be HTML: a host that answers a missing /assets/x.js with the SPA index.html (status 200)
     would otherwise poison the cache. The offline page is the one legitimate HTML file we store. */
  function isCacheableStaticResponse(res, pathname) {
    if (!isCacheableResponse(res)) return false;
    if (pathname === OFFLINE_URL) return true;
    var ct = ((res.headers && res.headers.get('content-type')) || '').toLowerCase();
    return ct.indexOf('text/html') === -1;
  }

  function isStaleCache(name, version) {
    return typeof name === 'string' && name.indexOf(CACHE_PREFIX) === 0 && name !== cacheName(version);
  }

  root.KalingaCachePolicy = {
    CACHE_PREFIX: CACHE_PREFIX, OFFLINE_URL: OFFLINE_URL, PRECACHE_URLS: PRECACHE_URLS,
    REQUIRED_PRECACHE_URLS: REQUIRED_PRECACHE_URLS,
    cacheName: cacheName, classifyRequest: classifyRequest, isPrivatePath: isPrivatePath,
    staticStrategy: staticStrategy,
    isCacheableResponse: isCacheableResponse, isCacheableStaticResponse: isCacheableStaticResponse, isStaleCache: isStaleCache,
  };
})(typeof self !== 'undefined' ? self : globalThis);
