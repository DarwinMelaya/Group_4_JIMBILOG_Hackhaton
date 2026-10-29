/* global self, URL */
/* KALINGA service worker cache policy: pure functions, no side effects.
   Loaded by sw.js via importScripts and by unit tests inside a vm sandbox.
   Public static assets only; everything else bypasses the cache. */
(function (root) {
  'use strict';
  var CACHE_PREFIX = 'kalinga-static-';
  var OFFLINE_URL = '/offline.html';
  var PRECACHE_URLS = [OFFLINE_URL, '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon.svg'];
  var PRIVATE_PREFIXES = ['/api/', '/staff', '/admin'];
  var STATIC_PREFIXES = ['/assets/', '/icons/'];
  var STATIC_FILES = ['/manifest.json', '/offline.html'];

  function cacheName(version) { return CACHE_PREFIX + version; }

  /* Returns 'bypass' | 'navigate' | 'static'. req: {method, url, mode}. */
  function classifyRequest(req, origin) {
    if (!req || String(req.method).toUpperCase() !== 'GET') return 'bypass';
    var u;
    try { u = new URL(req.url); } catch { return 'bypass'; }
    if (u.origin !== origin) return 'bypass';
    for (var i = 0; i < PRIVATE_PREFIXES.length; i++) {
      var p = PRIVATE_PREFIXES[i];
      if (u.pathname === p.replace(/\/$/, '') || u.pathname.indexOf(p) === 0) return 'bypass';
    }
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

  function isStaleCache(name, version) {
    return typeof name === 'string' && name.indexOf(CACHE_PREFIX) === 0 && name !== cacheName(version);
  }

  root.KalingaCachePolicy = {
    CACHE_PREFIX: CACHE_PREFIX, OFFLINE_URL: OFFLINE_URL, PRECACHE_URLS: PRECACHE_URLS,
    cacheName: cacheName, classifyRequest: classifyRequest,
    isCacheableResponse: isCacheableResponse, isStaleCache: isStaleCache,
  };
})(typeof self !== 'undefined' ? self : globalThis);
