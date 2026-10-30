// @vitest-environment node
import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import { ORIGIN, bootSw, fakeRes, readPublic, swReq } from './sw-sandbox';

interface Policy {
  classifyRequest(r: { method: string; url: string; mode?: string }, o: string): string;
  isPrivatePath(p: string): boolean;
  staticStrategy(p: string): string;
  REQUIRED_PRECACHE_URLS: string[];
  PRECACHE_URLS: string[];
}
function loadPolicy(): Policy {
  const sandbox: Record<string, unknown> = { URL };
  sandbox.self = sandbox;
  vm.runInNewContext(readPublic('cache-policy.js'), sandbox);
  return sandbox.KalingaCachePolicy as Policy;
}

describe('S1-9 (e) private paths match by segment', () => {
  const P = loadPolicy();
  it('matches the root and its children only', () => {
    for (const p of ['/staff', '/staff/', '/staff/queue', '/admin', '/admin/x', '/api', '/api/v1/public/config']) {
      expect(P.isPrivatePath(p), p).toBe(true);
    }
  });
  it('does not match look-alike segments', () => {
    for (const p of ['/staffing', '/staffing/team', '/administrator', '/apiary', '/learn/staff', '/']) {
      expect(P.isPrivatePath(p), p).toBe(false);
    }
  });
  it('is not bypassed by case, repeated slashes or percent-encoding', () => {
    for (const p of ['/Staff/queue', '/ADMIN', '//staff/queue', '/%73taff/queue', '/staff//queue']) {
      expect(P.isPrivatePath(p), p).toBe(true);
    }
    expect(P.isPrivatePath('/%E0%A4%A')).toBe(false); // malformed escape does not throw
  });
  it('classifies private navigations as bypass and look-alikes as normal navigations', () => {
    const nav = (url: string) => P.classifyRequest(swReq(url, 'GET', 'navigate'), ORIGIN);
    expect(nav('/staff/queue')).toBe('bypass');
    expect(nav('/Staff')).toBe('bypass');
    expect(nav('/staffing')).toBe('navigate');
    expect(nav('/administrator')).toBe('navigate');
  });
});

describe('S1-9 (b) strategy for non-hashed files', () => {
  const P = loadPolicy();
  it('hashed assets are immutable; manifest, icons and offline page revalidate', () => {
    expect(P.staticStrategy('/assets/index-abc123.js')).toBe('immutable');
    for (const p of ['/manifest.json', '/icons/icon-192.png', '/offline.html']) {
      expect(P.staticStrategy(p), p).toBe('revalidate');
    }
  });
  it('serves a cached manifest immediately and updates the cache from the network without a VERSION bump', async () => {
    const sw = bootSw();
    await sw.fire('install');
    const key = ORIGIN + '/manifest.json';
    sw.stores.get('kalinga-static-1')!.set(key, fakeRes('old manifest'));
    sw.fetchFn.mockResolvedValueOnce(fakeRes('new manifest'));
    const out = await sw.fire('fetch', { request: swReq('/manifest.json') });
    expect((out.value as { body: string }).body).toBe('old manifest'); // stale answer is instant
    expect(out.waitUntilCount).toBeGreaterThan(0); // revalidation is kept alive by waitUntil
    expect(out.settled.every((s) => s.status === 'fulfilled')).toBe(true);
    expect((sw.stores.get('kalinga-static-1')!.get(key) as { body: string }).body).toBe('new manifest');
    expect(sw.fetchFn).toHaveBeenCalledWith(expect.anything(), { cache: 'no-cache' });
  });
  it('propagates edits to icons the same way', async () => {
    const sw = bootSw();
    await sw.fire('install');
    const key = ORIGIN + '/icons/icon.svg';
    sw.stores.get('kalinga-static-1')!.set(key, fakeRes('old icon'));
    sw.fetchFn.mockResolvedValueOnce(fakeRes('new icon'));
    await sw.fire('fetch', { request: swReq('/icons/icon.svg') });
    expect((sw.stores.get('kalinga-static-1')!.get(key) as { body: string }).body).toBe('new icon');
  });
  it('keeps the stale copy and does not reject when the revalidation fails or is not cacheable', async () => {
    const sw = bootSw();
    await sw.fire('install');
    const key = ORIGIN + '/offline.html';
    sw.stores.get('kalinga-static-1')!.set(key, fakeRes('old offline'));
    sw.fetchFn.mockRejectedValueOnce(new Error('offline'));
    const a = await sw.fire('fetch', { request: swReq('/offline.html') });
    expect((a.value as { body: string }).body).toBe('old offline');
    expect(a.settled.every((s) => s.status === 'fulfilled')).toBe(true);
    sw.fetchFn.mockResolvedValueOnce(fakeRes('private', { 'cache-control': 'no-store' }));
    await sw.fire('fetch', { request: swReq('/offline.html') });
    expect((sw.stores.get('kalinga-static-1')!.get(key) as { body: string }).body).toBe('old offline');
  });
  it('fetches the network on a cold miss and caches it', async () => {
    const sw = bootSw();
    sw.fetchFn.mockResolvedValueOnce(fakeRes('fresh'));
    const out = await sw.fire('fetch', { request: swReq('/manifest.json') });
    expect((out.value as { body: string }).body).toBe('fresh');
    expect(sw.stores.get('kalinga-static-1')!.has(ORIGIN + '/manifest.json')).toBe(true);
  });
  it('hashed assets stay cache-first: a hit does not touch the network', async () => {
    const sw = bootSw();
    await sw.fire('install');
    const key = ORIGIN + '/assets/index-abc123.js';
    sw.stores.get('kalinga-static-1')!.set(key, fakeRes('cached js'));
    const out = await sw.fire('fetch', { request: swReq('/assets/index-abc123.js') });
    expect((out.value as { body: string }).body).toBe('cached js');
    expect(sw.fetchFn).not.toHaveBeenCalled();
  });
  it('refreshes the offline page after a successful navigation, once per worker lifetime', async () => {
    const sw = bootSw();
    await sw.fire('install');
    sw.fetchFn.mockImplementation(async (r: unknown) =>
      typeof r === 'string' ? fakeRes('new offline') : fakeRes('<html>page</html>'),
    );
    await sw.fire('fetch', { request: swReq('/clinics', 'GET', 'navigate') });
    expect((sw.stores.get('kalinga-static-1')!.get(ORIGIN + '/offline.html') as { body: string }).body).toBe('new offline');
    await sw.fire('fetch', { request: swReq('/learn', 'GET', 'navigate') });
    const offlineFetches = sw.fetchFn.mock.calls.filter((c) => c[0] === '/offline.html');
    expect(offlineFetches).toHaveLength(1);
  });
});

describe('S1-9 (c) cache writes are waited on and cannot fail a response', () => {
  it('registers the cache write with event.waitUntil', async () => {
    const sw = bootSw();
    sw.fetchFn.mockResolvedValueOnce(fakeRes('js'));
    const out = await sw.fire('fetch', { request: swReq('/assets/index-abc123.js') });
    expect(out.waitUntilCount).toBe(1);
    expect(sw.stores.get('kalinga-static-1')!.has(ORIGIN + '/assets/index-abc123.js')).toBe(true);
  });
  it('still returns the network response, and waitUntil settles fulfilled, when cache.put rejects', async () => {
    const sw = bootSw({ failPut: true });
    sw.fetchFn.mockResolvedValueOnce(fakeRes('js'));
    const out = await sw.fire('fetch', { request: swReq('/assets/index-abc123.js') });
    expect((out.value as { body: string }).body).toBe('js');
    expect(out.settled.map((s) => s.status)).toEqual(['fulfilled']);
  });
  it('same for the stale-while-revalidate path', async () => {
    const sw = bootSw({ failPut: true });
    sw.fetchFn.mockResolvedValueOnce(fakeRes('manifest'));
    const out = await sw.fire('fetch', { request: swReq('/manifest.json') });
    expect((out.value as { body: string }).body).toBe('manifest');
    expect(out.settled.every((s) => s.status === 'fulfilled')).toBe(true);
  });
  it('does not register a cache write for a non-cacheable response', async () => {
    const sw = bootSw();
    sw.fetchFn.mockResolvedValueOnce(fakeRes('x', { 'cache-control': 'no-store' }));
    const out = await sw.fire('fetch', { request: swReq('/assets/index-abc123.js') });
    expect(sw.stores.get('kalinga-static-1')?.size ?? 0).toBe(0);
    expect(out.settled.every((s) => s.status === 'fulfilled')).toBe(true);
  });
});

describe('S1-9 (d) tolerant precache install', () => {
  const P = loadPolicy();
  it('only the offline page is required', () => {
    expect(P.REQUIRED_PRECACHE_URLS).toEqual(['/offline.html']);
    expect(P.PRECACHE_URLS).toContain('/offline.html');
    expect(P.PRECACHE_URLS.length).toBeGreaterThan(1);
  });
  it('installs when every optional icon and the manifest fail', async () => {
    const sw = bootSw({ failAdd: (u) => u !== '/offline.html' });
    const out = await sw.fire('install');
    expect(out.settled.map((s) => s.status)).toEqual(['fulfilled']);
    expect([...sw.stores.get('kalinga-static-1')!.keys()]).toEqual([ORIGIN + '/offline.html']);
  });
  it('installs when only one icon is missing and caches the rest', async () => {
    const sw = bootSw({ failAdd: (u) => u === '/icons/icon-512.png' });
    const out = await sw.fire('install');
    expect(out.settled.map((s) => s.status)).toEqual(['fulfilled']);
    const keys = [...sw.stores.get('kalinga-static-1')!.keys()];
    expect(keys).toContain(ORIGIN + '/icons/icon-192.png');
    expect(keys).not.toContain(ORIGIN + '/icons/icon-512.png');
  });
  it('fails the install when the offline page cannot be cached', async () => {
    const sw = bootSw({ failAdd: (u) => u === '/offline.html' });
    const out = await sw.fire('install');
    expect(out.settled[0]!.status).toBe('rejected');
  });
});

describe('S1-9 (f) script path follows the registered base', () => {
  it('imports the policy relative to the worker script, not from the origin root', async () => {
    const sw = bootSw();
    expect(sw.importedScripts).toEqual(['cache-policy.js']);
  });
});
