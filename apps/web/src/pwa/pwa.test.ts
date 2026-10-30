// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const pub = path.resolve(import.meta.dirname, '../../public');
const read = (f: string) => fs.readFileSync(path.join(pub, f), 'utf8');
const ORIGIN = 'https://kalinga.test';

interface Policy {
  classifyRequest(r: { method: string; url: string; mode?: string }, o: string): string;
  isCacheableResponse(r: unknown): boolean;
  isStaleCache(n: string, v: string): boolean;
  cacheName(v: string): string;
}
function loadPolicy(): Policy {
  const sandbox: Record<string, unknown> = { URL };
  sandbox.self = sandbox;
  vm.runInNewContext(read('cache-policy.js'), sandbox);
  return sandbox.KalingaCachePolicy as Policy;
}
const res = (status: number, headers: Record<string, string> = {}, type = 'basic') => ({
  status,
  type,
  headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
});
const req = (url: string, method = 'GET', mode = 'cors') => ({ method, url: ORIGIN + url, mode });

describe('cache policy', () => {
  const P = loadPolicy();
  it('never caches /api/ requests', () => {
    expect(P.classifyRequest(req('/api/v1/public/config'), ORIGIN)).toBe('bypass');
    expect(P.classifyRequest(req('/api/v1/anything', 'GET', 'navigate'), ORIGIN)).toBe('bypass');
  });
  it('bypasses staff and admin routes', () => {
    expect(P.classifyRequest(req('/staff/queue', 'GET', 'navigate'), ORIGIN)).toBe('bypass');
    expect(P.classifyRequest(req('/admin', 'GET', 'navigate'), ORIGIN)).toBe('bypass');
  });
  it('never caches non-GET requests', () => {
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(P.classifyRequest(req('/assets/app.js', m), ORIGIN)).toBe('bypass');
    }
  });
  it('bypasses cross-origin and query-string requests', () => {
    expect(P.classifyRequest({ method: 'GET', url: 'https://other.test/assets/a.js' }, ORIGIN)).toBe('bypass');
    expect(P.classifyRequest(req('/assets/a.js?ref=abc'), ORIGIN)).toBe('bypass');
  });
  it('treats hashed static assets and icons as cacheable static', () => {
    expect(P.classifyRequest(req('/assets/index-abc123.js'), ORIGIN)).toBe('static');
    expect(P.classifyRequest(req('/icons/kalinga-logo.png'), ORIGIN)).toBe('static');
    expect(P.classifyRequest(req('/manifest.json'), ORIGIN)).toBe('static');
  });
  it('does not cache no-store, private, no-cache or cookie responses', () => {
    expect(P.isCacheableResponse(res(200, { 'cache-control': 'no-store' }))).toBe(false);
    expect(P.isCacheableResponse(res(200, { 'cache-control': 'private, max-age=60' }))).toBe(false);
    expect(P.isCacheableResponse(res(200, { 'cache-control': 'no-cache' }))).toBe(false);
    expect(P.isCacheableResponse(res(200, { 'set-cookie': 'a=b' }))).toBe(false);
    expect(P.isCacheableResponse(res(500))).toBe(false);
    expect(P.isCacheableResponse(res(200, {}, 'opaque'))).toBe(false);
  });
  it('caches ordinary public static responses', () => {
    expect(P.isCacheableResponse(res(200, { 'cache-control': 'public, max-age=31536000, immutable' }))).toBe(true);
    expect(P.isCacheableResponse(res(200))).toBe(true);
  });
  it('flags only other-version kalinga caches as stale', () => {
    expect(P.isStaleCache('kalinga-static-1', '2')).toBe(true);
    expect(P.isStaleCache('kalinga-static-2', '2')).toBe(false);
    expect(P.isStaleCache('someone-else', '2')).toBe(false);
  });
});

describe('sw.js in a vm sandbox', () => {
  type Handler = (e: Record<string, unknown>) => void;
  function boot(version?: string) {
    const handlers: Record<string, Handler> = {};
    const stores = new Map<string, Map<string, unknown>>();
    const caches = {
      open: async (n: string) => {
        if (!stores.has(n)) stores.set(n, new Map());
        const s = stores.get(n)!;
        return {
          add: async (u: string) => void s.set(u, `precached:${u}`),
          put: async (r: { url: string }, v: unknown) => void s.set(r.url, v),
        };
      },
      keys: async () => [...stores.keys()],
      delete: async (n: string) => stores.delete(n),
      match: async (r: string | { url: string }) => {
        const k = typeof r === 'string' ? r : r.url;
        for (const s of stores.values()) if (s.has(k)) return s.get(k);
        return undefined;
      },
    };
    const fetchFn = vi.fn();
    const skipWaiting = vi.fn();
    const sandbox: Record<string, unknown> = {
      URL,
      caches,
      fetch: fetchFn,
      Promise,
      Response: { error: () => 'NETWORK_ERROR' },
      location: { origin: ORIGIN },
      clients: { claim: vi.fn(async () => undefined) },
      skipWaiting,
      addEventListener: (t: string, h: Handler) => (handlers[t] = h),
      importScripts: () => vm.runInContext(read('cache-policy.js'), ctx),
    };
    sandbox.self = sandbox;
    const ctx = vm.createContext(sandbox);
    let src = read('sw.js');
    if (version) src = src.replace(/const VERSION = '[^']*'/, `const VERSION = '${version}'`);
    vm.runInContext(src, ctx);
    const fire = async (type: string, e: Record<string, unknown> = {}) => {
      let p: Promise<unknown> | undefined;
      let responded = false;
      handlers[type]!({
        ...e,
        waitUntil: (x: Promise<unknown>) => (p = x),
        respondWith: (x: Promise<unknown>) => {
          responded = true;
          p = x;
        },
      });
      return { responded, value: await p };
    };
    return { fire, stores, fetchFn, skipWaiting };
  }
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const okRes = (headers: Record<string, string> = {}) => ({
    ...res(200, headers),
    clone() {
      return this;
    },
  });

  it('does not intercept /api/ or POST requests', async () => {
    const sw = boot();
    const a = await sw.fire('fetch', { request: req('/api/v1/public/config') });
    const b = await sw.fire('fetch', { request: req('/assets/x.js', 'POST') });
    expect(a.responded).toBe(false);
    expect(b.responded).toBe(false);
    expect(sw.fetchFn).not.toHaveBeenCalled();
    expect([...sw.stores.values()].every((s) => s.size === 0)).toBe(true);
  });
  it('caches a static asset and skips a no-store response', async () => {
    const sw = boot();
    await sw.fire('install');
    sw.fetchFn.mockResolvedValueOnce(okRes());
    await sw.fire('fetch', { request: req('/assets/a.js') });
    await tick();
    expect(sw.stores.get('kalinga-static-1')!.has(ORIGIN + '/assets/a.js')).toBe(true);
    sw.fetchFn.mockResolvedValueOnce(okRes({ 'cache-control': 'no-store' }));
    await sw.fire('fetch', { request: req('/assets/b.js') });
    await tick();
    expect(sw.stores.get('kalinga-static-1')!.has(ORIGIN + '/assets/b.js')).toBe(false);
  });
  it('falls back to offline.html for offline navigations', async () => {
    const sw = boot();
    await sw.fire('install');
    sw.fetchFn.mockRejectedValueOnce(new Error('offline'));
    const out = await sw.fire('fetch', { request: req('/clinics', 'GET', 'navigate') });
    expect(out.value).toBe('precached:/offline.html');
  });
  it('activate deletes old-version caches and keeps the current one', async () => {
    const sw = boot('3');
    sw.stores.set('kalinga-static-1', new Map());
    sw.stores.set('kalinga-static-2', new Map());
    sw.stores.set('unrelated', new Map());
    await sw.fire('install');
    await sw.fire('activate');
    expect([...sw.stores.keys()].sort()).toEqual(['kalinga-static-3', 'unrelated']);
  });
  it('skipWaiting only on explicit message', async () => {
    const sw = boot();
    await sw.fire('install');
    expect(sw.skipWaiting).not.toHaveBeenCalled();
    await sw.fire('message', { data: { type: 'SKIP_WAITING' } });
    expect(sw.skipWaiting).toHaveBeenCalled();
  });
});

describe('manifest and shell files', () => {
  it('manifest.json is valid with required fields', () => {
    const m = JSON.parse(read('manifest.json'));
    expect(m.name).toBe('KALINGA');
    expect(m.short_name).toBe('KALINGA');
    expect(m.display).toBe('standalone');
    expect(m.start_url).toBe('/');
    expect(m.theme_color).toBe('#161955');
    expect(m.background_color).toBe('#F7F6FD');
    expect(m.icons.length).toBeGreaterThan(0);
    for (const i of m.icons) {
      expect(fs.existsSync(path.join(pub, i.src))).toBe(true);
      expect(i.purpose).not.toContain('maskable');
    }
  });
  it('index.html links manifest and theme-color', () => {
    const html = fs.readFileSync(path.resolve(pub, '../index.html'), 'utf8');
    expect(html).toContain('rel="manifest"');
    expect(html).toContain('name="theme-color"');
  });
  it('offline page is bilingual and states public-only', () => {
    const html = read('offline.html');
    expect(html).toContain('lang="en"');
    expect(html).toContain('lang="fil"');
    expect(html).toMatch(/Only public information/);
  });
});
